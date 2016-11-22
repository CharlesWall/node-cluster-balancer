#!/bin/bash

bin/start-docker.sh

node test/bin/run.js test

bin/stop-docker.sh
