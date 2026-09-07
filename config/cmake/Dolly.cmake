set(CMAKE_DL_LIBS "")
set(CMAKE_EXE_EXPORTS_C_FLAG "-rdynamic")
include(Platform/UnixPaths)

foreach(lang C CXX)
  set(CMAKE_${lang}_ARCHIVE_CREATE "<CMAKE_AR> rcs <TARGET> <OBJECTS>")
  set(CMAKE_${lang}_ARCHIVE_FINISH "")
  set(CMAKE_${lang}_USE_RESPONSE_FILE_FOR_OBJECTS 1)
endforeach()
