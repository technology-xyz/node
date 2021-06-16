#!/bin/bash
#
# Deploys an 8 pod stack of koi-nodes based on the values.*.yaml that are in this directory.
# You can pass in a docker image tag as the first argument, and an AWS profile flag as a second argument. Both are optional.

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

if [ "$TRAVIS_BRANCH" == "dev" ]; then

    SHORTSHA=`git log --pretty=format:'%h' -n 1`
    TAG="--set image.tag=$SHORTSHA"

fi

if [ -n "$1" ]; then

    TAG="--set image.tag=$1"

fi

if [[ -n "$2" ]]; then
    export AWS_PROFILE=$2
fi

# This is not a pull request in travis. Configure kubectl, eksctl
if [ -z "$TRAVIS_PULL_REQUEST" ] || [ "$TRAVIS_PULL_REQUEST" == "false" ]; then

    aws eks update-kubeconfig --name koi --region us-west-2

fi

export HELM_EXPERIMENTAL_OCI=1
helm chart pull public.ecr.aws/r3r0i7b9/koi_node_helm:latest
helm chart export public.ecr.aws/r3r0i7b9/koi_node_helm:latest

for node in ${nodes[@]}; do
    sops -d values.$node.yaml > values.$node.dec.yaml
    helm upgrade --install koi-$node ./koi-node -n koi -f values.$node.dec.yaml `echo $TAG`
done