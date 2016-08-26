#!/bin/bash

bin/start-docker.sh

mocha test

bin/stop-docker.sh
