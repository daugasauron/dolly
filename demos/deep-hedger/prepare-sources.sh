# Sourced by scripts/prepare-image-sources.sh.
if has_image deep-hedger-build; then
  copy_static demos/deep-hedger/dh-gui.cpp deep-hedger/dh-gui.cpp
  copy_static demos/deep-hedger/dh-fit.mojo deep-hedger/dh-fit.mojo
fi
if has_image deep-hedger; then
  copy_static demos/deep-hedger/backtest.tsv deep-hedger/backtest.tsv
fi
