# jik

An AST-aware JavaScript AWK!

Query your codebase quickly and easily:

```shell
$ # find all "~~x" style conversions
$ jik 'unary[operator=~] > unary[operator=~]' my_code/
my_code/my_file.js
1:~i
$
$ # find potential xss!
$ jik 'call > id[name="$"] + * binary[operator=\+] > literal:contains(>)' my_code/
2:'<div id="'
2:'></div>'
$ # print it out with more context!
$ jik 'call > id[name="$"] + * binary[operator=\+] > literal:contains(>)' '{print(parents("call"))}' my_code/
$('<div id="' + username + '"></div>')
```

# installation

`npm install -g jik`

# license

MIT
