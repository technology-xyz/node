#! /bin/bash

# Push only if it's not a pull request
if [ -z "$TRAVIS_PULL_REQUEST" ] || [ "$TRAVIS_PULL_REQUEST" == "false" ]; then

  pip install awscli
  export PATH=$PATH:$HOME/.local/bin

  eval $(aws ecr-public get-login-password --region us-east-1)
  # Push only if we're testing the main branch
  if [ "$TRAVIS_BRANCH" == "dev" ]; then

    SHORTSHA=`git log --pretty=format:'%h' -n 1`

    docker tag koi_node:dev "public.ecr.aws/r3r0i7b9/koi_node:dev-$SHORTSHA"
    docker push "public.ecr.aws/r3r0i7b9/koi_node:dev-$SHORTSHA"

    echo "Pushed koi_node:dev-$SHORTSHA"

    ./deploy.sh

  else
    echo "Skipping deploy because branch is not 'dev'"
  fi

  if [ "$TRAVIS_BRANCH" == "main" ]; then

    docker tag koi_node:dev public.ecr.aws/r3r0i7b9/koi_node:main
    docker tag koi_node:dev public.ecr.aws/r3r0i7b9/koi_node:latest
    docker push "public.ecr.aws/r3r0i7b9/koi_node:main"
    docker push "public.ecr.aws/r3r0i7b9/koi_node:latest"

    echo "Pushed koi_node:main and koi_node:latest"
  else
    echo "Skipping prod image build/push because branch is not 'main'"
  fi

else
  echo "Skipping deploy because it's a pull request"
fi
