// rclone for Dolly: upstream's rclone.go with the local and WebDAV backends
// and the commands that keep a folder in step with a server and look at it.
package main

import (
	_ "github.com/rclone/rclone/backend/local"
	_ "github.com/rclone/rclone/backend/webdav"
	"github.com/rclone/rclone/cmd"
	_ "github.com/rclone/rclone/cmd/about"
	_ "github.com/rclone/rclone/cmd/bisync"
	_ "github.com/rclone/rclone/cmd/cat"
	_ "github.com/rclone/rclone/cmd/check"
	_ "github.com/rclone/rclone/cmd/config"
	_ "github.com/rclone/rclone/cmd/copy"
	_ "github.com/rclone/rclone/cmd/copyto"
	_ "github.com/rclone/rclone/cmd/delete"
	_ "github.com/rclone/rclone/cmd/deletefile"
	_ "github.com/rclone/rclone/cmd/listremotes"
	_ "github.com/rclone/rclone/cmd/ls"
	_ "github.com/rclone/rclone/cmd/lsd"
	_ "github.com/rclone/rclone/cmd/lsf"
	_ "github.com/rclone/rclone/cmd/lsjson"
	_ "github.com/rclone/rclone/cmd/lsl"
	_ "github.com/rclone/rclone/cmd/mkdir"
	_ "github.com/rclone/rclone/cmd/move"
	_ "github.com/rclone/rclone/cmd/moveto"
	_ "github.com/rclone/rclone/cmd/obscure"
	_ "github.com/rclone/rclone/cmd/purge"
	_ "github.com/rclone/rclone/cmd/rcat"
	_ "github.com/rclone/rclone/cmd/rmdir"
	_ "github.com/rclone/rclone/cmd/size"
	_ "github.com/rclone/rclone/cmd/sync"
	_ "github.com/rclone/rclone/cmd/touch"
	_ "github.com/rclone/rclone/cmd/tree"
	_ "github.com/rclone/rclone/cmd/version"
)

func main() {
	cmd.Main()
}
