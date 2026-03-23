; Nunba Installer Script
; "A Friend, A Well Wisher, Your LocalMind"
; Connect to Hivemind with your friends' agents

#define MyAppName "Nunba"
#define MyAppVersion "2.0"
#define MyAppPublisher "HevolveAI"
#define MyAppURL "https://hevolve.hertzai.com"
#define MyAppExeName "Nunba.exe"
#define MyAppId "{{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"
#define MyAppTagline "A Friend, A Well Wisher, Your LocalMind"

[Setup]
; Source directory is the project root (one level up from scripts/)
SourceDir=..
; Basic setup information
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppPublisher}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; Require administrator rights — installs to Program Files
PrivilegesRequired=admin
OutputDir=Output
OutputBaseFilename=Nunba_Setup
Compression=lzma
SolidCompression=yes
; Use the application icon for the setup
SetupIconFile=app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
; Create the app in Program Files folder
DisableDirPage=no
DisableProgramGroupPage=yes
; Enable Windows 10 style
WizardStyle=modern
; Enable detailed logging
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startupicon"; Description: "Start automatically when Windows starts"; GroupDescription: "Windows startup"
Name: "protocolhandler"; Description: "Register hevolveai:// protocol handler (enables web browser launching)"; GroupDescription: "Web Integration"
Name: "setupai"; Description: "Configure AI features (detects existing services like Ollama, or downloads bundled AI)"; GroupDescription: "AI Features (Recommended)"

[Files]
; Main executable and all dependencies from cx_Freeze build
Source: "build\Nunba\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Include icon file
Source: "app.ico"; DestDir: "{app}"; Flags: ignoreversion
; WebView2 bootstrapper (will auto-install if needed)
Source: "MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
; Normal shortcuts don't include the --background flag
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; Comment: "{#MyAppTagline}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\app.ico"; Comment: "{#MyAppTagline}"

[Run]
; Interactive AI setup - scans for existing services and lets user choose
; waituntilterminated: installer waits for wizard to finish before proceeding
Filename: "{app}\{#MyAppExeName}"; Parameters: "--setup-ai"; Description: "Configure AI - detect local services or set up cloud AI"; StatusMsg: "Configuring AI features..."; Tasks: setupai; Flags: postinstall waituntilterminated runascurrentuser hidewizard
; Launch app — checked by default so it auto-starts after install (and after AI setup if selected)
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} - Your LocalMind"; Flags: nowait postinstall skipifsilent shellexec

[Dirs]
; Create the log directory in user Documents
Name: "{userdocs}\Nunba\logs"; Flags: uninsalwaysuninstall

[Code]
// Check if the .NET Framework 4.5 or higher is installed
function IsDotNetDetected(): boolean;
var
    success: boolean;
    release: cardinal;
    key: string;
begin
    // .NET 4.5+ release key
    key := 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full';
    success := RegQueryDWordValue(HKLM, key, 'Release', release);

    if success then begin
        // Release values >= 378389 correspond to .NET 4.5+
        Result := (release >= 378389);
    end else begin
        Result := False;
    end;
end;

// Check if WebView2 Runtime is installed
function IsWebView2Installed(): boolean;
var
    version: string;
begin
    // Check for WebView2 in registry (per-machine installation)
    Result := RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', version);
    if not Result then
        // Check 32-bit registry
        Result := RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', version);
    if not Result then
        // Check per-user installation
        Result := RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', version);

    if Result then
        Log('WebView2 found, version: ' + version)
    else
        Log('WebView2 not found');
end;

// Install WebView2 if not present
procedure InstallWebView2();
var
    ResultCode: Integer;
    WebView2Path: string;
begin
    if not IsWebView2Installed() then
    begin
        Log('Installing WebView2 Runtime...');
        WebView2Path := ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe');

        // Run bootstrapper silently - it will download and install WebView2
        if Exec(WebView2Path, '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
        begin
            if ResultCode = 0 then
                Log('WebView2 installed successfully')
            else
                Log('WebView2 installation returned code: ' + IntToStr(ResultCode));
        end
        else
        begin
            Log('Failed to run WebView2 installer');
        end;
    end
    else
    begin
        Log('WebView2 already installed, skipping');
    end;
end;

// Register startup and protocol entries programmatically
procedure RegisterEntries();
var
    appExePath: string;
    protocolCommand: string;
begin
    // Get the app executable path
    appExePath := ExpandConstant('{app}\{#MyAppExeName}');
    protocolCommand := '"' + appExePath + '" --protocol "%1"';

    // Register startup entry if selected
    if WizardIsTaskSelected('startupicon') then
    begin
        if RegWriteStringValue(HKCU, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Run',
                               'Nunba', '"' + appExePath + '" --background') then
        begin
            Log('Registered Nunba startup entry');
        end
        else
        begin
            Log('Failed to register startup entry');
        end;
    end;

    // Register protocol handler if selected (hevolveai:// protocol)
    if WizardIsTaskSelected('protocolhandler') then
    begin
        try
            // Main protocol key - hevolveai://
            RegWriteStringValue(HKCR, 'hevolveai', '', 'URL:HevolveAI Protocol');
            RegWriteStringValue(HKCR, 'hevolveai', 'URL Protocol', '');

            // Default icon
            RegWriteStringValue(HKCR, 'hevolveai\DefaultIcon', '', appExePath + ',0');

            // Shell command
            RegWriteStringValue(HKCR, 'hevolveai\shell', '', 'open');
            RegWriteStringValue(HKCR, 'hevolveai\shell\open', '', '&Open');
            RegWriteStringValue(HKCR, 'hevolveai\shell\open\command', '', protocolCommand);

            Log('Protocol handler hevolveai:// registered successfully');
            Log('Protocol command: ' + protocolCommand);
        except
            Log('Error registering protocol handler');
        end;
    end;
end;

procedure InitializeWizard;
begin
    // WebView2 will be installed automatically if needed
    Log('Installer initialized. WebView2 will be installed if needed.');
end;

// Clean stale bytecode before new files are copied (upgrade safety).
// Previous installs or manual patches may leave __pycache__/ dirs and
// orphaned .py/.pyc that shadow the fresh build's compiled modules.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
    ResultCode: Integer;
begin
    Result := '';
    // Kill running Nunba so files aren't locked
    Exec('taskkill', '/F /IM Nunba.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('taskkill', '/F /IM llama-server.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(500);
    // Purge __pycache__ recursively and stale lib/ from previous install
    if DirExists(ExpandConstant('{app}')) then
    begin
        DelTree(ExpandConstant('{app}\lib'), True, True, True);
        DelTree(ExpandConstant('{app}\__pycache__'), True, True, True);
        // Recurse: Inno can't glob **/__pycache__, use known deep paths
        DelTree(ExpandConstant('{app}\core\__pycache__'), True, True, True);
        DelTree(ExpandConstant('{app}\security\__pycache__'), True, True, True);
        DelTree(ExpandConstant('{app}\integrations\__pycache__'), True, True, True);
        DelTree(ExpandConstant('{app}\agent_ledger\__pycache__'), True, True, True);
        Log('Purged stale __pycache__ and lib/ from previous install');
    end;
end;

// Set up entries during installation
procedure CurStepChanged(CurStep: TSetupStep);
begin
    if CurStep = ssPostInstall then
    begin
        // Install WebView2 first (required for the app to run)
        InstallWebView2();
        // Then register startup and protocol entries
        RegisterEntries();
    end;
end;

// Prompt user before uninstallation
function InitializeUninstall(): Boolean;
begin
    Result := MsgBox('Do you want to uninstall {#MyAppName}? ' +
                    'All application files and registry entries will be removed.',
                    mbConfirmation, MB_YESNO) = IDYES;
end;

// Kill running Nunba instance before uninstall removes files
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
    ResultCode: Integer;
begin
    if CurUninstallStep = usUninstall then
    begin
        // Kill Nunba.exe (and any child llama-server) before file removal
        Exec('taskkill', '/F /IM Nunba.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Exec('taskkill', '/F /IM llama-server.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        // Brief pause to let processes release file handles
        Sleep(1000);
    end;

    if CurUninstallStep = usPostUninstall then
    begin
        // Clean up install directory remnants (python-embed, __pycache__, etc.)
        // Inno Setup only removes files it installed — build artifacts need manual cleanup
        DelTree(ExpandConstant('{app}\python-embed'), True, True, True);
        DelTree(ExpandConstant('{app}\__pycache__'), True, True, True);
        DelTree(ExpandConstant('{app}\lib'), True, True, True);
        // Remove the install dir itself if empty
        RemoveDir(ExpandConstant('{app}'));

        // Clean up user Documents directory
        DelTree(ExpandConstant('{userdocs}\Nunba'), True, True, True);

        // Remove startup registry entry
        try
            RegDeleteValue(HKCU, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 'Nunba');
            Log('Removed Nunba startup registry entry');
        except
            Log('Error removing startup registry entry');
        end;

        // Remove protocol registry entries (hevolveai://)
        try
            RegDeleteKeyIncludingSubkeys(HKCR, 'hevolveai');
            Log('Removed hevolveai protocol registry entries');
        except
            Log('Error removing protocol registry entries');
        end;
    end;
end;
