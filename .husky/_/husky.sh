#!/bin/sh
if [ -z "$husky_skip_init" ]; then
  debug () {
    [ "$HUSKY_DEBUG" = "true" ] && echo "$1"
  }

  readonly husky_skip_init=1
  export husky_skip_init
  readonly husky_use_stdin=${husky_use_stdin:-false}
  debug "husky:debug init $0" "$@"

  readonly hook_name="$(basename "$0")"
  debug "husky:debug hook_name=$hook_name"
  readonly husky_script="${HUSKY-$0}"
  debug "husky:debug husky_script=$husky_script"
  if [ "$husky_script" != "$0" ]; then
    readonly husky_dir="$(dirname "$husky_script")"
    readonly husky_hook_dir="$husky_dir/.husky"
    debug "husky:debug husky_dir=$husky_dir"
  else
    readonly husky_dir="$(cd "$(dirname "$0")/.." && pwd)"
    readonly husky_hook_dir="$husky_dir/.husky"
    debug "husky:debug husky_dir=$husky_dir"
  fi

  readonly husky_hook_file="$husky_hook_dir/$hook_name"
  debug "husky:debug husky_hook_file=$husky_hook_file"

  if [ -f "$husky_hook_file" ]; then
    if [ "$HUSKY" = "0" ]; then
      debug "husky:debug HUSKY env variable is set to 0, skipping hook"
      exit 0
    fi

    if [ ! -x "$husky_hook_file" ]; then
      debug "husky:debug making hook executable: $husky_hook_file"
      chmod +x "$husky_hook_file"
    fi

    if [ "$husky_use_stdin" = "true" ]; then
      debug "husky:debug passing stdin to hook: $husky_hook_file"
      cat <&0 | sh "$husky_hook_file" "$@"
    else
      debug "husky:debug executing hook: $husky_hook_file"
      sh "$husky_hook_file" "$@"
    fi
  fi
fi
