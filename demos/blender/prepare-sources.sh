# Sourced by scripts/prepare-image-sources.sh.
if has_image blender-deps || has_image blender; then
  blender_dir="$(bash demos/blender/prepare-build-sources.sh)"
fi
if has_image blender-deps; then
  # Each library's source, and its licence files where the blender package keeps them.
  blender_licences=/usr/share/licenses/blender
  node scripts/build-source-tar.mjs "${static_dir}/blender/deps.tar.gz" \
    demos/blender/ccfilter.c /tmp/blender-deps/ccfilter.c \
    demos/blender/openimageio-dolly.patch /tmp/blender-deps/openimageio-dolly.patch \
    "${blender_dir}/brotli-1.0.10" /tmp/blender-deps/brotli \
    "${blender_dir}/brotli-1.0.10/LICENSE" "${blender_licences}/brotli/LICENSE" \
    "${blender_dir}/freetype-VER-2-14-3" /tmp/blender-deps/freetype \
    "${blender_dir}/freetype-VER-2-14-3/LICENSE.TXT" "${blender_licences}/freetype/LICENSE.TXT" \
    "${blender_dir}/freetype-VER-2-14-3/docs/FTL.TXT" "${blender_licences}/freetype/FTL.TXT" \
    "${blender_dir}/libjpeg-turbo-2.1.3" /tmp/blender-deps/libjpeg-turbo \
    "${blender_dir}/libjpeg-turbo-2.1.3/LICENSE.md" "${blender_licences}/libjpeg-turbo/LICENSE.md" \
    "${blender_dir}/libjpeg-turbo-2.1.3/README.ijg" "${blender_licences}/libjpeg-turbo/README.ijg" \
    "${blender_dir}/fmt-12.1.0" /tmp/blender-deps/fmt \
    "${blender_dir}/fmt-12.1.0/LICENSE" "${blender_licences}/fmt/LICENSE" \
    "${blender_dir}/Imath-3.2.2" /tmp/blender-deps/imath \
    "${blender_dir}/Imath-3.2.2/LICENSE.md" "${blender_licences}/imath/LICENSE.md" \
    "${blender_dir}/libdeflate-1.18" /tmp/blender-deps/libdeflate \
    "${blender_dir}/libdeflate-1.18/COPYING" "${blender_licences}/libdeflate/COPYING" \
    "${blender_dir}/OpenJPH-0.25.2" /tmp/blender-deps/openjph \
    "${blender_dir}/OpenJPH-0.25.2/LICENSE" "${blender_licences}/openjph/LICENSE" \
    "${blender_dir}/openexr-3.4.10" /tmp/blender-deps/openexr \
    "${blender_dir}/openexr-3.4.10/LICENSE.md" "${blender_licences}/openexr/LICENSE.md" \
    "${blender_dir}/tiff-4.7.1" /tmp/blender-deps/tiff \
    "${blender_dir}/tiff-4.7.1/LICENSE.md" "${blender_licences}/tiff/LICENSE.md" \
    "${blender_dir}/robin-map-1.3.0" /tmp/blender-deps/robin-map \
    "${blender_dir}/robin-map-1.3.0/LICENSE" "${blender_licences}/robin-map/LICENSE" \
    "${blender_dir}/pugixml-1.10" /tmp/blender-deps/pugixml \
    "${blender_dir}/pugixml-1.10/LICENSE.md" "${blender_licences}/pugixml/LICENSE.md" \
    "${blender_dir}/libexpat-R_2_7_5/expat" /tmp/blender-deps/expat \
    "${blender_dir}/libexpat-R_2_7_5/expat/COPYING" "${blender_licences}/expat/COPYING" \
    "${blender_dir}/yaml-cpp-0.8.0" /tmp/blender-deps/yaml-cpp \
    "${blender_dir}/yaml-cpp-0.8.0/LICENSE" "${blender_licences}/yaml-cpp/LICENSE" \
    "${blender_dir}/pystring-1.1.3" /tmp/blender-deps/pystring \
    "${blender_dir}/pystring-1.1.3/LICENSE" "${blender_licences}/pystring/LICENSE" \
    "${blender_dir}/minizip-ng-4.2.2" /tmp/blender-deps/minizip-ng \
    "${blender_dir}/minizip-ng-4.2.2/LICENSE" "${blender_licences}/minizip-ng/LICENSE" \
    "${blender_dir}/OpenColorIO-2.5.0" /tmp/blender-deps/opencolorio \
    "${blender_dir}/OpenColorIO-2.5.0/LICENSE" "${blender_licences}/opencolorio/LICENSE" \
    "${blender_dir}/OpenColorIO-2.5.0/THIRD-PARTY.md" "${blender_licences}/opencolorio/THIRD-PARTY.md" \
    "${blender_dir}/OpenImageIO-3.1.16.0" /tmp/blender-deps/openimageio \
    "${blender_dir}/OpenImageIO-3.1.16.0/LICENSE.md" "${blender_licences}/openimageio/LICENSE.md" \
    "${blender_dir}/OpenImageIO-3.1.16.0/THIRD-PARTY.md" "${blender_licences}/openimageio/THIRD-PARTY.md" \
    "${blender_dir}/eigen-8a1083e9bf41b91fdea6546681f806154efdc25a" /tmp/blender-deps/eigen \
    "${blender_dir}/eigen-8a1083e9bf41b91fdea6546681f806154efdc25a/COPYING.README" "${blender_licences}/eigen/COPYING.README" \
    "${blender_dir}/eigen-8a1083e9bf41b91fdea6546681f806154efdc25a/COPYING.MPL2" "${blender_licences}/eigen/COPYING.MPL2" \
    "${blender_dir}/eigen-8a1083e9bf41b91fdea6546681f806154efdc25a/COPYING.BSD" "${blender_licences}/eigen/COPYING.BSD" \
    "${blender_dir}/eigen-8a1083e9bf41b91fdea6546681f806154efdc25a/COPYING.APACHE" "${blender_licences}/eigen/COPYING.APACHE" \
    "${blender_dir}/eigen-8a1083e9bf41b91fdea6546681f806154efdc25a/COPYING.MINPACK" "${blender_licences}/eigen/COPYING.MINPACK" \
    "${blender_dir}/oneTBB-2022.3.0" /tmp/blender-deps/onetbb \
    "${blender_dir}/oneTBB-2022.3.0/LICENSE.txt" "${blender_licences}/onetbb/LICENSE.txt" \
    "${blender_dir}/oneTBB-2022.3.0/third-party-programs.txt" "${blender_licences}/onetbb/third-party-programs.txt" \
    "${blender_dir}/libepoxy-1.5.10" /tmp/blender-deps/libepoxy \
    "${blender_dir}/libepoxy-1.5.10/COPYING" "${blender_licences}/epoxy/COPYING"
fi
if has_image blender; then
  # Dolly's files in Blender's tree: the GHOST system and the GPU module's WebGPU backend.
  ghost=/tmp/blender/source/intern/ghost/intern
  node scripts/build-source-tar.mjs "${static_dir}/blender/blender.tar.gz" \
    demos/blender/blender-dolly.patch /tmp/blender/blender-dolly.patch \
    "${blender_dir}/blender-5.3.0" /tmp/blender/source \
    demos/blender/ghost/GHOST_ContextWebGPU.hh "${ghost}/GHOST_ContextWebGPU.hh" \
    demos/blender/ghost/GHOST_SystemDolly.cc "${ghost}/GHOST_SystemDolly.cc" \
    demos/blender/ghost/GHOST_SystemDolly.hh "${ghost}/GHOST_SystemDolly.hh" \
    demos/blender/ghost/GHOST_WindowDolly.cc "${ghost}/GHOST_WindowDolly.cc" \
    demos/blender/ghost/GHOST_WindowDolly.hh "${ghost}/GHOST_WindowDolly.hh" \
    demos/blender/webgpu /tmp/blender/source/source/blender/gpu/webgpu
fi
