#!/bin/bash
#
# Deploys an 8 pod stack of koi-nodes based on the values.*.yaml that are in this directory.

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



if [ "$TRAVIS_BRANCH" == "main" ]; then

    cd $TRAVIS_BUILD_DIR/build/staging_deploy

    # This is not a pull request in travis. Configure kubectl, eksctl
    if [ -z "$TRAVIS_PULL_REQUEST" ] || [ "$TRAVIS_PULL_REQUEST" == "false" ]; then

        aws eks update-kubeconfig --name koi-staging --region us-west-2

        export HELM_EXPERIMENTAL_OCI=1
        helm chart pull public.ecr.aws/r3r0i7b9/koi_node_helm:latest
        helm chart export public.ecr.aws/r3r0i7b9/koi_node_helm:latest

        for node in ${nodes[@]}; do
            sops -d ./$node/secrets.yaml > ./$node/secrets.dec.yaml
            helm upgrade --install koi-$node ./koi-node -n koi -f ./$node/secrets.dec.yaml -f ./$node/values.yaml
        done

    fi

fi