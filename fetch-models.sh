#!/bin/sh
set -eu

cd "$(dirname "$0")"
revision=00d96f7f18894055e7f1db44fa0df6462e5e4c8a
destination=app/src/main/assets/web/models
mkdir -p "$destination"

download() {
    target="$destination/$1.glb"
    temporary="$target.download"
    trap 'rm -f "$temporary"' EXIT
    curl --fail --location --silent --show-error \
        "https://raw.githubusercontent.com/06wj/pokemon/$revision/public/models/$2/model.glb" \
        --output "$temporary"
    mv "$temporary" "$target"
    trap - EXIT
}

download bulbasaur 001
download charmander 004
download squirtle 007
download pikachu 025
download eevee 133
