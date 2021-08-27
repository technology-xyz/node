#! /bin/bash

# Push only if it's not a pull request
if [ -z "$TRAVIS_PULL_REQUEST" ] || [ "$TRAVIS_PULL_REQUEST" == "false" ]; then

  pip install awscli
  export PATH=$PATH:$HOME/.local/bin
  SHORTSHA=`git log --pretty=format:'%h' -n 1`

  aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws/r3r0i7b9
  # Push only if we're testing the main branch
  if [ "$TRAVIS_BRANCH" == "dev" ]; then

    docker tag koi_node:dev "public.ecr.aws/r3r0i7b9/koi_node:dev-$SHORTSHA"
    docker push "public.ecr.aws/r3r0i7b9/koi_node:dev-$SHORTSHA"

    echo "Pushed koi_node:dev-$SHORTSHA"

    ./build/dev_deploy/deploy.sh

  fi

  if [ "$TRAVIS_BRANCH" == "main" ]; then

    docker tag koi_node:dev "public.ecr.aws/r3r0i7b9/koi_node:main-$SHORTSHA"
    docker tag koi_node:dev public.ecr.aws/r3r0i7b9/koi_node:latest
    docker push "public.ecr.aws/r3r0i7b9/koi_node:main-$SHORTSHA"
    docker push "public.ecr.aws/r3r0i7b9/koi_node:latest"

    echo "Pushed koi_node:main-$SHORTSHA and koi_node:latest"

    ./build/prod_deploy/deploy.sh

  fi

else
  echo "Skipping deploy because it's a pull request"
fi
