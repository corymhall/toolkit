local ls = require "luasnip"
--
-- this is a snippet creator
-- s(<trigger>, <nodes>)
local s = ls.s

-- this is a format node
-- it takes a format string, a list of nodes
-- fmt(<fmt_string>, {...nodes})
local fmt = require("luasnip.extras.fmt").fmt

-- this is an insert node
-- it takes a position (like $1) and optionally some default text
-- i(<position>, [default_text])
local i = ls.insert_node

-- repeats a node
-- rep(<position>)
ls.add_snippets("typescript", {
  s(
    "cb",
    fmt(
      [[
        /**
         * {}
         */
        ]],
      {
        i(0),
      }
    )
  ),
  s(
    "newcl",
    fmt(
      [[
        export class {} {{
          constructor({}) {{
            {}
          }}
        }}
        ]],
      {
        i(1),
        i(2),
        i(0),
      }
    )
  ),
})
