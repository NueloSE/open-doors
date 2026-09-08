#!/usr/bin/env bash
# Convenience wrapper. Sign-in lives in the CLI itself so it reaches everyone,
# including npm and npx users and anyone on Windows, where a shell script does
# not help.
exec open-doors signin "$@"
