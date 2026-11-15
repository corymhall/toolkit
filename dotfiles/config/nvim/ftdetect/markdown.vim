" Detect markdown for proper file types
augroup MdDetect
  au!
  au BufReadPost *.md,*.markdown,*.mdown,*.wiki set filetype=markdown
augroup END
