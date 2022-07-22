#!/usr/bin/env sh
# This script is used in the README and https://www.infracost.io/docs/#quick-start
set -e

# check_sha is separated into a defined function so that we can
# capture the exit code effectively with `set -e` enabled
check_sha() {
  (
    cd /tmp/
    shasum -sc "$1"
  )

  return $?
}

os=$(uname | tr '[:upper:]' '[:lower:]')
arch=$(uname -m | tr '[:upper:]' '[:lower:]' | sed -e s/x86_64/amd64/)
if [ "$arch" = "aarch64" ]; then
  arch="arm64"
fi

bin_target=${INFRACOST_BIN_TARGET:-$os-$arch}


url="https://infracost.io/downloads/latest"
tar="infracost-$bin_target.tar.gz"
echo "Downloading latest release of infracost-$bin_target..."
curl -sL "$url/$tar" -o "/tmp/$tar"
echo

code=$(curl -s -L -o /dev/null -w "%{http_code}" "$url/$tar.sha256")
if [ "$code" = "404" ]; then
    echo "Skipping checksum validation as the sha for the release could not be found, no action needed."
else
  echo "Validating checksum for infracost-$bin_target..."
  curl -sL "$url/$tar.sha256" -o "/tmp/$tar.sha256"

  if ! check_sha "$tar.sha256"; then
    exit 1
  fi

  rm "/tmp/$tar.sha256"
fi
echo

tar xzf "/tmp/$tar" -C /tmp
rm "/tmp/$tar"

mkdir -p "bin"
mv "/tmp/infracost-$bin_target" "bin/infracost"
