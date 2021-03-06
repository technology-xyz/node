# Node_Cli

The following repo contains a CLI interface to interact with contract and also guides on how you can create your very own KOI_Task.

Example:
`yarn start --TRUSTED_SERVICE_URL=none --AR_WALLET=../wallet.json --NODE_MODE=service --TASKS=VUZakty8P1-hatk117ImiwYSmFVR1PNf78-21aqtAp4`

## Install

For a minimally working witness node:

1. `git clone https://github.com/open-koi/node_cli.git`
2. `yarn install`
3. `yarn start`

Additionally, if you would like to like to run a service node, do the following before `yarn start`:

1. Setup `.env` specifying at least `REDIS_IP` and `REDIS_PORT`
2. Ensure Redis is running
3. Ensure wallet contains some AR token

## CLI Params and Env vars

- **TASKS** - Comma separated task IDS to be executed
- **REDIS_IP** - Redis IP to connect to
- **REDIS_PORT** - Redis port to connect to
- **AR_WALLET** - Path to Arweave wallet json
- **NODE_MODE** - [service|witness] Node mode to use
- **STAKE** - Amount of AR token to stake, required for `service` and recommended for `witness` modes
- **SERVER_PORT** - Port for the express server to operate on
- **SERVICE_URL** - URL to propagate to other nodes to discover this node. Skips registration if left empty.
- **TRUSTED_SERVICE_URL** - Initial service node to bootstrap propagation, set to `none` to disable propagation, or if this is a trusted node. Uses SDK default if left empty (https://bundler.openkoi.com:8888)
- **S3_ACCESS_KEY_ID** - ID used for AWS S3
- **S3_SECRET_ACCESS_KEY** - Access key for AWS s3
- **RESTORE_KOHAKU** - Restore Kohaku from redis cache if this is not set to `false`

## Service setup

```sh
chmod a+x koi-node
sudo mkdir -p /var/lib/koi
sudo ln -sf /path/to/wallet.json /var/lib/koi/wallet.json
sudo ln -sf "$(pwd)/koi-node" /usr/local/bin/
sudo cp -f koi-node.service /etc/systemd/system/
sudo systemctl enable koi-node # Enables koi-node to auto start
```

Here are typical commands for a systemd service
```sh
sudo systemctl daemon-reload                              # reload configuration files
sudo systemctl start koi-node                             # start the service now
sudo systemctl stop koi-node                              # stop the service now (but don't wait for it finish stopping)
sudo systemctl status koi-node                            # show if the service is running and the last few log lines
sudo systemctl enable koi-node                            # start the service on boot
sudo systemctl disable koi-node                           # don't start the service on boot
sudo journalctl --unit=koi-node --since='-5 min' --follow # look at recent logs and await more
```

## Run using docker-compose
Start the stack with `docker compose up --build`. The stack runs two services:

1. Redis
2. Koi node

Redis will save its rdb snapshots to the `data` folder in this repo. If this folder doesn't exist you will need to create it. 

You can modify the functionality of the koi node by changing the environment variables in `docker-compose.yaml`. You will need to change the wallet volume mount (default is `/path/to/wallet.json`) to the path of your wallet on the machine this stack is running on. 
## TODO

- Setup KOI Tasks: If you select `Show KOI Tasks` to view the list of available tasks. Then you can enter the Id or name of any task which you want to run.The KOI associated with that task will get transferred to your wallet once the task is successfully completed and submitted to bundler(TODO: Need to combine this smart contract with original one).
