function av() {aws-vault exec "$@[1, -1]"}

# Global npm install
function npmg() {
  pkg="$1"
  pushd "~/personal/pde-go/dotfiles/npm"
  npm install "$pkg"
  popd
}

# Upgrade tools in the global mise config without scanning unrelated tracked configs.
function mise-upgrade-global() {
  local state exit_status arg
  local -a args
  local now=0

  for arg in "$@"; do
    case "$arg" in
      --now)
        now=1
        ;;
      pi)
        args+=(aqua:earendil-works/pi)
        ;;
      *)
        args+=("$arg")
        ;;
    esac
  done

  state="$(mktemp -d)" || return 1
  if (( now )); then
    MISE_STATE_DIR="$state" MISE_USE_VERSIONS_HOST=false MISE_FETCH_REMOTE_VERSIONS_CACHE=0s \
      mise upgrade "${args[@]}" --minimum-release-age 0s --exclude yarn --cd "$HOME"
  else
    MISE_STATE_DIR="$state" mise upgrade "${args[@]}" --exclude yarn --cd "$HOME"
  fi
  exit_status=$?
  rm -rf -- "$state"
  return "$exit_status"
}
alias mug='mise-upgrade-global'

function exp() {
  pulumi logout
  if [ "$1" = "w" ]
  then
    export PULUMI_ACCESS_TOKEN=$PULUMI_WORK_TOKEN
  elif [ "$1" = "r" ]
  then
    export PULUMI_ACCESS_TOKEN=$PULUMI_REVIEW_TOKEN
  else
    export PULUMI_ACCESS_TOKEN=$PULUMI_PERSONAL_TOKEN
  fi
  pulumi login
}
