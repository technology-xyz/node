#! /bin/bash
set -e
export PATH=$PATH:$HOME/.local/bin

docker build -f Dockerfile.ci -t koi_node:dev .
