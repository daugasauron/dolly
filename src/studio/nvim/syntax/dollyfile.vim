if exists('b:current_syntax')
  finish
endif
syntax match dollyDirective /^\s*\%(DOLLY\|IMAGE\|MODULE\|FROM\|COPY\|USE\|SOURCE\|REQUIRES\|EXPORTS\|SLOP\|FILE\|FOLDER\|ENTRY\)\>/
syntax keyword dollyType HOST URL TOOL LIB ENV HEADER CWD APPEND
syntax match dollyHash /\<[0-9a-f]\{64}\>/
syntax match dollyComment /^\s*#.*/
syntax region dollyBody start=/^FILE .*\n\ze    / end=/^\ze\%(    \)\@!/ keepend
highlight default link dollyDirective Statement
highlight default link dollyType Type
highlight default link dollyHash Constant
highlight default link dollyComment Comment
highlight default link dollyBody Normal
let b:current_syntax = 'dollyfile'
