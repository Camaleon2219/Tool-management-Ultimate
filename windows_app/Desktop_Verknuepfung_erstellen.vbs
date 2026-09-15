Set oWS = WScript.CreateObject("WScript.Shell")
sDesktop = oWS.SpecialFolders("Desktop")
Set oLink = oWS.CreateShortcut(sDesktop & "\FJK CNC-Werkzeugverwaltung.lnk")

Dim sEdgePath, sUrl
sUrl = "https://ais-pre-wpnyg2itor6x6by2sihzpz-550906376930.europe-west2.run.app"
sEdgePath = oWS.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe")

Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")

If fso.FileExists(sEdgePath) Then
    oLink.TargetPath = sEdgePath
    oLink.Arguments = "--app=" & sUrl
Else
    sEdgePath = oWS.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe")
    If fso.FileExists(sEdgePath) Then
        oLink.TargetPath = sEdgePath
        oLink.Arguments = "--app=" & sUrl
    Else
        oLink.TargetPath = sUrl
    End If
End If

oLink.Description = "FJK CNC-Werkzeugverwaltung"
oLink.WindowStyle = 1
oLink.Save

MsgBox "Fertig!" & vbCrLf & vbCrLf & "Die Verknüpfung 'FJK CNC-Werkzeugverwaltung' wurde erfolgreich auf Ihrem Windows-Desktop erstellt!", 64, "FJK CNC Installation"
