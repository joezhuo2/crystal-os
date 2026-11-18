; The updater starts this installer while the app is still exiting. The stock
; running-app check then fails with "Failed to kill" on the half-closed
; process and leaves the passive window stuck, and it never looks at the
; crystal-api sidecar, whose running exe cannot be overwritten. So both are
; ended here first, retrying until neither is left (taskkill exits 128 when
; nothing matches). No /T: this installer is a child of the app it replaces.
; shortcut: matches by image name, so a dev build running at update time is ended too; match on $INSTDIR if that bites
!macro NSIS_HOOK_PREINSTALL
  Push $R7
  Push $R8
  Push $R9
  StrCpy $R9 0
  crystal_stop_loop:
    nsExec::Exec 'taskkill /F /IM "${MAINBINARYNAME}.exe"'
    Pop $R8
    nsExec::Exec 'taskkill /F /IM crystal-api.exe'
    Pop $R7
    ${If} $R8 != 128
    ${OrIf} $R7 != 128
      IntOp $R9 $R9 + 1
      ${If} $R9 < 40
        Sleep 500
        Goto crystal_stop_loop
      ${EndIf}
    ${EndIf}
  Pop $R9
  Pop $R8
  Pop $R7
!macroend
