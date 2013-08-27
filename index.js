var language = require('cssauron-falafel')
  , optimist = require('optimist')
  , falafel = require('falafel')
  , through = require('through')
  , ls = require('ls-stream')
  , path = require('path')
  , fs = require('fs')

var resolve = require('resolve')

var selector = optimist.argv._.shift()

var next_is_action = optimist.argv._.length > 1 &&
    optimist.argv._[0].indexOf('{') > -1

var action = next_is_action ?
    optimist.argv._.shift() : '{print($POS, $NODE)}'
  , help_text = path.join(__dirname, 'help.txt')
  , filenames = optimist.argv._
  , exitcode = 0
  , bad_command
  , pipeline

bad_command = !optimist.argv.help && (!selector || !filenames.length)

pipeline = isdirify()

if(bad_command) {
  process.stdout.write(
      fs.readFileSync(help_text, 'utf8')
        .split('\n').slice(0, 1)
        .join('\n') + '\n'
  )
  process.exit(1)
} else if(optimist.argv.help) {
  var spawn = require('child_process').spawn
    , tty = require('tty')
    , pager

  function raw(mode) {
    process.stdin.setRawMode ?
      process.stdin.setRawMode(mode) :
      tty.setRawMode(mode)
  }

  raw(true)
  pager = spawn(process.env.PAGER || 'less', ['-R', help_text], {
      customFds: [0, 1, 2]
  })

  pager.on('exit', function(code, sig) {
    raw(false)
    process.exit()
  })
} else {
  pipeline.pipe(filter()).pipe(nom())

  while(filenames.length) {
    pipeline.write(filenames.shift())
  }

  pipeline.end()
}

function isdirify() {
  var stream = through(write, end)
    , pending = 0
    , ended

  return stream

  function write(filename) {
    ++pending
    fs.lstat(filename, function(err, stat) {
      if(err) {
        return stream.emit('error', err)
      }

      if(stat.isDirectory()) {
        ls(filename)
          .on('data', ondata)
          .on('error', onerror)
          .on('end', onend)
      } else {
        stream.queue({path: filename, stat: stat})
        check(-1)
      }
    })
  }

  function ondata(info) {
    stream.queue(info)
  }

  function onerror(err) {
    stream.emit('error', err)
  }

  function onend() {
    check(-1)
  }

  function check(val) {
    pending += val || 0

    if(!pending && ended) {
      stream.queue(null)
    }
  }

  function end() {
    ended = true
    check()
  }
}

function filter() {
  return through(function(info) {
    if(path.extname(info.path) === '.js' && info.stat.isFile()) {
      this.queue(info)
    }
  })
}

function nom() {
  var ended = false
    , pending = []
    , current
    , stream

  return stream = through(write, end)

  function write(info) {
    pending.push(info)
    check()
  }

  function check() {
    if(current) {
      return
    }

    if(!pending.length) {
      if(ended) {
        stream.queue(null)
      }

      return
    }

    current = true
    process_file(pending.shift().path, follow, function() {
      current = false
      check()
    })
  }

  function follow(filename) {
    try {
      var stat = fs.lstatSync(filename)

      pending.push({
          path: filename
        , stat: stat
      })

      check()
    } catch(err) {

    }
  }

  function end() {
    ended = true

    if(pending.length) {
      return
    }

    stream.queue(null)
  }
}

function process_file(filename, follow, ready) {
  fs.readFile(filename, 'utf8', function(err, data) {
    if(err) {
      throw err
    }

    var done = false
      , output = []
      , lang

    lang = language(selector)

    data = 'function __NOPE__() {\n' + data + '\n}'

    function idx_to_line_col(idx) {
      var line = 0
        , col = 0
        , i = 0

      while(i < idx) {
        ++col

        if(data[i++] === '\n') {
          col = 0
          ++line
        }
      }

      return {line: line, col: col}
    }

    try {
      falafel(data, function(node) {
        var is_nope = node.parent &&
                      node.parent.id &&
                      node.parent.id.name === '__NOPE__'

        if(is_nope) {
          node.parent = null
        }

        if(node.id && node.id.name === '__NOPE__') {
          return
        }

        if(lang(node)) {
          output.push(node)
        }
      })
    } catch(err) {
      return ready()
    }

    var node
      , act

    act = parse_action(act)

    while(output.length) {
      node = output.shift()

      try {
        act(node, !output.length)
      } catch(err) {

      }
    }

    ready()

    function parse_action(str) {
      var fn = Function(
          'print'
        , '_parents'
        , '_pos'
        , '_is'
        , '$FILE'
        , '$DIR'
        , 'require'
        , 'follow'
        , 'action.called = 0; return action\n' +
        'function action($NODE, $LAST) {\n' +
        '  var $LINE = _pos($NODE.range[0]).line\n' +
        '  var $COUNT = action.called++\n' +
        '  var $POS = ($COUNT === 0 ? $FILE + "\\n" : "") + $LINE + ": "\n' +
        '  parents = function(n, s) { return arguments.length === 1 ?\n' +
        '     _parents($NODE, n) : _parents(n, s)\n' +
        '  }\n' +
        '  is = function(n, s) { return arguments.length === 1 ?\n' +
        '     _is($NODE, n) : _is(n, s)\n' +
        '  }\n' +
        '  {;' + action + '; }' +
        '}'
      )

      return fn(
          print
        , parents
        , idx_to_line_col
        , is
        , filename.replace(process.cwd(), './')
        , path.dirname(filename.replace(process.cwd(), './'))
        , _require
        , follow
      )

      function is(node, sel) {
        return language(sel)(node)
      }

      function _require(what) {
        return what.indexOf('.') === 0 ?
          resolve.sync(what, {basedir: process.cwd()}) :
          require(what)
      }

      function print() {
        process.stdout.write(
            [].slice.call(arguments).map(coerce).join('') + '\n'
        )
      }

      function coerce(item) {
        return (item.source ? item.source() : item) + ''
      }

      function parents(node, sel) {
        var sel = language(sel)
          , cur = node.parent

        while(cur && !sel(cur)) {
          cur = cur.parent
        }

        return cur || {}
      }
    }

  })
}
