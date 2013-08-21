var language = require('cssauron-falafel')
  , optimist = require('optimist')
  , falafel = require('falafel')
  , through = require('through')
  , ls = require('ls-stream')
  , path = require('path')
  , fs = require('fs')

var selector = optimist.argv._[0]
  , filename = optimist.argv._[1]

if(!selector || !filename) {
  return
}

fs.lstat(filename, function(err, stat) {
  if(err) {
    throw err
  }

  if(stat.isDirectory()) {
    ls(filename)
      .pipe(filter())
      .pipe(nom())

  } else {
    process_file(filename, function() {

    })
  }
})

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
        if(node.parent && node.parent.id && node.parent.id.name === '__NOPE__') {
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

    if(output.length) {
      console.log(filename.replace(process.cwd()))
    }

    while(output.length) {
      node = output.shift()
      console.log('%s: "%s"', idx_to_line_col(node.range[0]).line, node.source())
    }

    ready()
  })
}
