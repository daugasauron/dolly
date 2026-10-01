DOLLY 5
MODULE search-tools

# ripgrep and fd built from source by the Rust demo images.
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 1be9a055b87ce75b4696f2ecd4279d5c1340427058e7b5927fb436b76119bac8 /usr/bin/rg /usr/bin/rg
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 1be9a055b87ce75b4696f2ecd4279d5c1340427058e7b5927fb436b76119bac8 /usr/share/licenses/ripgrep /usr/share/licenses/ripgrep
COPY FROM https://daugasauron.com/Dollyfile-ripgrep 1be9a055b87ce75b4696f2ecd4279d5c1340427058e7b5927fb436b76119bac8 /usr/share/dolly/builds/ripgrep.json /usr/share/dolly/builds/ripgrep.json
EXPORTS TOOL rg

COPY FROM https://daugasauron.com/Dollyfile-fd-build c88edebd1c8a4610178ca9069193dab559afd7e7eb146c3334e59d6d81500e8b /usr/bin/fd /usr/bin/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build c88edebd1c8a4610178ca9069193dab559afd7e7eb146c3334e59d6d81500e8b /usr/share/licenses/fd /usr/share/licenses/fd
COPY FROM https://daugasauron.com/Dollyfile-fd-build c88edebd1c8a4610178ca9069193dab559afd7e7eb146c3334e59d6d81500e8b /usr/share/dolly/builds/fd.json /usr/share/dolly/builds/fd.json
EXPORTS TOOL fd
