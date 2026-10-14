xsdl_server = executable(
    'Xsdl',
    'sdl.c',
    include_directories: [inc, include_directories('../src')],
    dependencies: [common_dep, dependency('sdl2')],
    link_with: [
        libxserver_main,
        kdrive,
        libxserver_fb,
        libxserver,
        libxserver_config,
        libxserver_xkb_stubs,
        libxserver_xi_stubs,
        libxserver_glx,
        libglxvnd,
    ],
    install: true,
)
