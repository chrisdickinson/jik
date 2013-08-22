# jik

A JavaScript-searching chainsaw! Query by AST shape! Print arbitrary output per selected AST node!

Find potential constructed-HTML XSS vectors in your site:

```
$ jik 'call > *:first-child + binary[operator=\+] > literal:contains(>)' js/
```

Give it more context than just the innermost node!

```
$ jik 'call > *:first-child + binary[operator=\+] > literal:contains(>)' \
  '{print($POS, parents("call"))}' js/
```

Find signed int conversions in your codebase!

```
$ jik 'binary[operator=\|] > literal, assign[operator=\|\=], unary[operator=\~] > unary[operator=\~]' js/
```

List all of the function names defined in your codebase!

```
$ jik \
  'function[id] > id:first-child, :any(assign,variable) > id + function' \
  '{print($POS, (is("function") ? $NODE.parent.id || $NODE.parent.left : $NODE))}' \
  js/
```

# basic usage

`jik <selector> [<action>] <target> [<target>...]`

Where selector is a [cssauron-falafel](http://npm.im/cssauron-falafel) selector, action
is any valid javascript surrounded by `{}`, and `<target>` is a file or directory. Directory
targets are recursed and every entry ending with `.js` is searched.

The help -- accessed via `jik --help` has an **extensive** description of the selector language
and available variables in actions.

# installation

`npm install -g jik`

# license

MIT
