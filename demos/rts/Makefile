# SPDX-License-Identifier: GPL-2.0-or-later
CXX := c++
SOURCE := /usr/src/7kaa
PORT := /usr/src/dolly/rts
BUILD := /tmp/seven-kingdoms/build
SOURCES := $(wildcard $(SOURCE)/src/*.cpp) \
           $(wildcard $(SOURCE)/src/imgfun/generic/*.cpp) \
           $(SOURCE)/src/enet/multiplayer.cpp
OBJECTS := $(patsubst $(SOURCE)/%.cpp,$(BUILD)/%.o,$(SOURCES)) \
           $(patsubst $(PORT)/%.cpp,$(BUILD)/port/%.o,$(wildcard $(PORT)/*.cpp))
CXXFLAGS := -O1 -std=c++11 -fsigned-char -fno-strict-aliasing \
            -I$(PORT) -I$(SOURCE)/include -I/usr/include/SDL2 -include $(PORT)/config.h

/usr/bin/seven-kingdoms: $(OBJECTS)
	$(CXX) $(OBJECTS) -o $@ -lSDL2 -lz -lm

$(BUILD)/port/%.o: $(PORT)/%.cpp
	mkdir -p $(@D)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD)/%.o: $(SOURCE)/%.cpp
	mkdir -p $(@D)
	$(CXX) $(CXXFLAGS) -c $< -o $@
