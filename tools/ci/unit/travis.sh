#!/bin/bash

RETRY=10

# generate port number between 10000 ~ 60000
export TEST_AGENT_PORT=$[ 10000 + $RANDOM % (60000 + 1 - 10000) ]

# pass websocketUrl to test-agent
TESTAGENT_URL="http://test-agent.gaiamobile.org:8080/"
TESTAGENT_URL="$TESTAGENT_URL#?websocketUrl=ws%3A%2F%2Ftest-agent.gaiamobile.org%3A${TEST_AGENT_PORT}"

RED_COLOR=$(printf "\x1b[31;1m")
GREEN_COLOR=$(printf "\x1b[32;1m")
NORMAL_COLOR=$(printf "\x1b[0m")

GJSLINT_PACKAGE_URL=http://closure-linter.googlecode.com/files/closure_linter-latest.tar.gz

function waiting_port {
  for i in $(seq 1 $RETRY); do
    nc -z localhost $1
    if [ $? -eq 0 ]; then return; fi
    sleep 1
  done
  echo "Waiting for server on port $1 failed."
  exit 1
}

function section_echo {
  echo ${GREEN_COLOR}$1${NORMAL_COLOR}
  echo ${GREEN_COLOR}`seq -s= $(expr ${#1} + 1)|tr -d '[:digit:]'`${NORMAL_COLOR}
}

echo
section_echo 'Integration Tests (make test-integration)'
# download b2g-desktop (here to avoid spam).
make b2g &> /dev/null
# build profile folder ahead of time (also here to avoid spam).
PROFILE_FOLDER=profile-test make &> /dev/null
# make test-integration will also download b2g but its alot of spam
make test-integration
INTEGRATION_TEST_RESULT_STATUS=$?
echo

[ $LINT_RESULT_STATUS -ne 0 ] &&\
echo ${RED_COLOR}Lint error. Scroll up to see the output.${NORMAL_COLOR}

exit `expr $LINT_RESULT_STATUS + $TEST_RESULT_STATUS + $INTEGRATION_TEST_RESULT_STATUS`;
