SRC = manifest.json
SRC += icon48.png
SRC += content.js

build: build/saltyjabber.zip

build/saltyjabber: $(SRC)
	mkdir -p $@
	for file in $(SRC); do cp $$file $@/; done

build/saltyjabber.zip: build/saltyjabber
	cd $< && zip -r ../saltyjabber.zip *


clean:
	rm -rf build

.PHONY: build clean