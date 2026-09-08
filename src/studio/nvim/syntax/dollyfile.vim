if exists('b:current_syntax')
  finish
endif
syntax match dollyDirective /^\s*\%(DOLLY\|IMAGE\|MODULE\|FROM\|COPY\|USE\|SOURCE\|REQUIRES\|EXPORTS\|SLOP\|FILE\|FOLDER\|ENTRY\)\>/
syntax keyword dollyType HOST URL TOOL LIB ENV HEADER CWD APPEND
syntax match dollyHash /\<[0-9a-f]\{64}\>/
syntax match dollyComment /^\s*#.*/
syntax region dollyBody matchgroup=dollyDirective start=/^FILE\>/ end=/^\ze\S/ keepend
highlight default dollyDirective ctermfg=3 guifg=#f2d45c cterm=bold gui=bold
highlight default link dollyType dollyDirective
highlight default dollyHash ctermfg=8 guifg=#77736c
highlight default link dollyComment dollyHash
highlight default link dollyBody Normal
let b:current_syntax = 'dollyfile'
