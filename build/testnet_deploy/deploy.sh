#!/bin/bash

nodes=(
    "node1"
    "node2"
    "node3"
    "node4"
    "node5"
    "node6"
    "node7"
    "node8"
)

if [[ -n "$1" ]]; then
  export AWS_PROFILE=$1
fi

tag=""
if [[ -n "$2" ]]; then
    tag="--set image.tag=$2"
fi

for node in ${nodes[@]}; do
    (cd koi-node && \
    sops -d ../values.$node.yaml > ../values.$node.dec.yaml && \
    helm upgrade --install koi-$node . -f ../values.$node.dec.yaml `echo $tag` \
    )
done