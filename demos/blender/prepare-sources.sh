# Sourced by scripts/prepare-image-sources.sh.
if has_image blender-deps || has_image blender; then
  blender_dir="$(bash demos/blender/prepare-build-sources.sh)"
fi
if has_image blender-deps; then
  node scripts/build-source-tar.mjs "${static_dir}/blender/deps.tar.gz" \
    demos/blender/ccfilter.c /tmp/blender-deps/ccfilter.c \
    demos/blender/openimageio-dolly.patch /tmp/blender-deps/openimageio-dolly.patch \
    "${blender_dir}/brotli-1.0.10" /tmp/blender-deps/brotli \
    "${blender_dir}/freetype-VER-2-14-3" /tmp/blender-deps/freetype \
    "${blender_dir}/libjpeg-turbo-2.1.3" /tmp/blender-deps/libjpeg-turbo \
    "${blender_dir}/fmt-12.1.0" /tmp/blender-deps/fmt \
    "${blender_dir}/Imath-3.2.2" /tmp/blender-deps/imath \
    "${blender_dir}/libdeflate-1.18" /tmp/blender-deps/libdeflate \
    "${blender_dir}/OpenJPH-0.25.2" /tmp/blender-deps/openjph \
    "${blender_dir}/openexr-3.4.10" /tmp/blender-deps/openexr \
    "${blender_dir}/tiff-4.7.1" /tmp/blender-deps/tiff \
    "${blender_dir}/robin-map-1.3.0" /tmp/blender-deps/robin-map \
    "${blender_dir}/pugixml-1.10" /tmp/blender-deps/pugixml \
    "${blender_dir}/libexpat-R_2_7_5/expat" /tmp/blender-deps/expat \
    "${blender_dir}/yaml-cpp-0.8.0" /tmp/blender-deps/yaml-cpp \
    "${blender_dir}/pystring-1.1.3" /tmp/blender-deps/pystring \
    "${blender_dir}/minizip-ng-4.2.2" /tmp/blender-deps/minizip-ng \
    "${blender_dir}/OpenColorIO-2.5.0" /tmp/blender-deps/opencolorio \
    "${blender_dir}/OpenImageIO-3.1.16.0" /tmp/blender-deps/openimageio \
    "${blender_dir}/eigen-8a1083e9bf41b91fdea6546681f806154efdc25a" /tmp/blender-deps/eigen \
    "${blender_dir}/oneTBB-2022.3.0" /tmp/blender-deps/onetbb \
    "${blender_dir}/libepoxy-1.5.10" /tmp/blender-deps/libepoxy
fi
if has_image blender; then
  node scripts/build-source-tar.mjs "${static_dir}/blender/blender.tar.gz" \
    demos/blender/blender-dolly.patch /tmp/blender/blender-dolly.patch \
    "${blender_dir}/blender-5.3.0" /tmp/blender/source
fi
