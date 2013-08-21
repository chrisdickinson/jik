var language = require('cssauron-falafel')
  , optimist = require('optimist')
  , falafel = require('falafel')
  , through = require('through')
  , ls = require('ls-stream')
  , path = require('path')
  , fs = require('fs')

var selector = optimist.argv._.shift()

var next_is_action = optimist.argv._.length > 1 &&
    optimist.argv._[0].indexOf('{') > -1

var action = next_is_action ?
    optimist.argv._.shift() : '{print($POS, $NODE)}'
  , filenames = optimist.argv._
  , pipeline

if(!selector || !filenames.length) {
  process.exit(1)
}

pipeline = isdirify()

pipeline.pipe(filter()).pipe(nom())

while(filenames.length) {
  pipeline.write(filenames.shift())
}

pipeline.end()

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
    process_file(pending.shift().path, function() {
      current = false
      check()
    })
  }

  function end() {
    ended = true

    if(pending.length) {
      return
    }

    stream.queue(null)
  }
}

function process_file(filename, ready) {
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
      act(node)
    }

    ready()

    function parse_action(str) {
      return Function(
          'print'
        , 'parents'
        , 'pos'
        , '$FILE'
        , 'action.called = 0; return action\nfunction action($NODE) {\n' +
        '  var $LINE = pos($NODE.range[0]).line\n' +
        '  var $FIRST = action.called++ === 0\n' +
        '  var $POS = ($FIRST ? $FILE + "\\n" : "") + $LINE + ": "\n' +
        '  ;' + action + ';' +
        '}'
      )(print, parents, idx_to_line_col, filename.replace(process.cwd(), './'))

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
