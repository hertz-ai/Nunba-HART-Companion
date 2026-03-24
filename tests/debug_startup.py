"""
This script tests and logs various startup-related issues.
Save this as debug_startup.py in the same directory as your application.
"""
import ctypes
import json
import os
import subprocess
import sys
import time
import traceback
import winreg


def is_admin():
    """Check if the script is running with admin privileges"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False

def get_startup_entries():
    """Get all startup entries from registry and startup folder"""
    entries = []
    
    # Check registry run keys
    reg_paths = [
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run")
    ]
    
    for hkey, path in reg_paths:
        try:
            key = winreg.OpenKey(hkey, path)
            i = 0
            while True:
                try:
                    name, value, _ = winreg.EnumValue(key, i)
                    entries.append({"type": "registry", "location": f"{hkey}\\{path}", "name": name, "value": value})
                    i += 1
                except OSError:
                    break
        except Exception as e:
            entries.append({"type": "error", "location": f"{hkey}\\{path}", "error": str(e)})
    
    # Check startup folders
    startup_folders = [
        os.path.join(os.environ["APPDATA"], r"Microsoft\Windows\Start Menu\Programs\Startup"),
        os.path.join(os.environ["ALLUSERSPROFILE"], r"Microsoft\Windows\Start Menu\Programs\Startup")
    ]
    
    for folder in startup_folders:
        try:
            if os.path.exists(folder):
                for file in os.listdir(folder):
                    file_path = os.path.join(folder, file)
                    entries.append({"type": "folder", "location": folder, "name": file, "path": file_path})
        except Exception as e:
            entries.append({"type": "error", "location": folder, "error": str(e)})
    
    # Check scheduled tasks
    try:
        output = subprocess.check_output(["schtasks", "/query", "/fo", "list", "/v"], text=True)
        lines = output.split('\n')
        current_task = {}
        for line in lines:
            if line.startswith("TaskName:"):
                if current_task and "HevolveAi" in current_task.get("TaskName", ""):
                    entries.append({"type": "task", **current_task})
                current_task = {"TaskName": line.split(":", 1)[1].strip()}
            elif ":" in line and current_task:
                key, value = line.split(":", 1)
                current_task[key.strip()] = value.strip()
        if current_task and "HevolveAi" in current_task.get("TaskName", ""):
            entries.append({"type": "task", **current_task})
    except Exception as e:
        entries.append({"type": "error", "location": "scheduled tasks", "error": str(e)})
    
    return entries

def check_exe_permissions(exe_path):
    """Check if the exe file has the right permissions"""
    if not os.path.exists(exe_path):
        return {"exists": False, "error": f"File not found: {exe_path}"}
    
    result = {"exists": True, "size": os.path.getsize(exe_path)}
    
    try:
        # Check if file can be executed
        if sys.platform == "win32":
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            si.wShowWindow = 0  # SW_HIDE
            
            # Try to start the process but immediately terminate it
            process = subprocess.Popen(
                [exe_path, "--help"], 
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                startupinfo=si,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            time.sleep(0.5)  # Give it a moment to start
            try:
                process.terminate()
            except Exception:
                pass
            
            result["executable"] = True
        else:
            # For non-Windows platforms
            result["executable"] = os.access(exe_path, os.X_OK)
    except Exception as e:
        result["executable"] = False
        result["error"] = str(e)
    
    return result

def check_dependencies():
    """Check if key dependencies are available"""
    dependencies = [
        "pystray", "PIL", "pywebview", "flask", "flask_cors"
    ]
    
    results = {}
    for dep in dependencies:
        try:
            if dep == "PIL":
                try:
                    import PIL
                    results[dep] = {"available": True, "version": PIL.__version__}
                except Exception:
                    results[dep] = {"available": False, "error": "Import error"}
            else:
                module = __import__(dep)
                if hasattr(module, "__version__"):
                    results[dep] = {"available": True, "version": module.__version__}
                else:
                    results[dep] = {"available": True, "version": "Unknown"}
        except ImportError:
            results[dep] = {"available": False, "error": "Not installed"}
        except Exception as e:
            results[dep] = {"available": False, "error": str(e)}
    
    return results

def check_environment():
    """Check system environment and paths"""
    env_info = {
        "python_version": sys.version,
        "platform": sys.platform,
        "executable": sys.executable,
        "cwd": os.getcwd(),
        "user_profile": os.environ.get("USERPROFILE", ""),
        "temp_dir": os.environ.get("TEMP", ""),
        "appdata": os.environ.get("APPDATA", ""),
        "is_frozen": getattr(sys, "frozen", False),
        "is_admin": is_admin()
    }
    
    # Check if Documents folder is accessible
    try:
        docs_path = os.path.join(os.path.expanduser("~"), "Documents")
        os.makedirs(os.path.join(docs_path, "HevolveAi Agent Companion", "test"), exist_ok=True)
        test_file = os.path.join(docs_path, "HevolveAi Agent Companion", "test", "write_test.txt")
        with open(test_file, "w") as f:
            f.write("Test write access")
        os.remove(test_file)
        env_info["documents_writable"] = True
    except Exception as e:
        env_info["documents_writable"] = False
        env_info["documents_error"] = str(e)
    
    return env_info

def run_diagnostics():
    """Run all diagnostics and save results to a file"""
    try:
        # Determine the location of the executable
        if getattr(sys, "frozen", False):
            # Running as compiled exe
            exe_path = sys.executable
            app_dir = os.path.dirname(exe_path)
        else:
            # Running as script
            script_path = os.path.abspath(__file__)
            app_dir = os.path.dirname(script_path)
            # Try to find the exe in the same directory
            exe_files = [f for f in os.listdir(app_dir) if f.endswith(".exe")]
            exe_path = os.path.join(app_dir, exe_files[0]) if exe_files else None
        
        # Collect diagnostic information
        diagnostics = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "app_dir": app_dir,
            "exe_path": exe_path,
            "startup_entries": get_startup_entries(),
            "exe_permissions": check_exe_permissions(exe_path) if exe_path else {"error": "No exe found"},
            "dependencies": check_dependencies(),
            "environment": check_environment()
        }
        
        # Save results to user's desktop
        desktop_path = os.path.join(os.path.expanduser("~"), "Documents")
        output_file = os.path.join(desktop_path, "hevolveai_startup_diagnostics.json")
        
        with open(output_file, "w") as f:
            json.dump(diagnostics, f, indent=2)
        
        print(f"Diagnostics saved to: {output_file}")
        
        # Create a more human-readable summary
        summary_file = os.path.join(desktop_path, "hevolveai_startup_summary.txt")
        
        with open(summary_file, "w") as f:
            f.write("HevolveAI Agent Companion Startup Diagnostics\n")
            f.write("===========================================\n\n")
            
            f.write(f"Time: {diagnostics['timestamp']}\n")
            f.write(f"Application directory: {diagnostics['app_dir']}\n")
            f.write(f"Executable path: {diagnostics['exe_path']}\n\n")
            
            f.write("Startup Entries:\n")
            for entry in diagnostics['startup_entries']:
                if entry['type'] == 'registry':
                    f.write(f"  Registry: {entry['name']} = {entry['value']}\n")
                elif entry['type'] == 'folder':
                    f.write(f"  Folder: {entry['location']}\\{entry['name']}\n")
                elif entry['type'] == 'task':
                    f.write(f"  Task: {entry.get('TaskName', 'Unknown')}\n")
                    f.write(f"    Status: {entry.get('Status', 'Unknown')}\n")
                    f.write(f"    Last run: {entry.get('Last Run Time', 'Unknown')}\n")
                    f.write(f"    Last result: {entry.get('Last Result', 'Unknown')}\n")
            
            f.write("\nExecutable Check:\n")
            exe_check = diagnostics['exe_permissions']
            if exe_check.get('exists', False):
                f.write(f"  File exists: Yes (Size: {exe_check.get('size', 'Unknown')} bytes)\n")
                f.write(f"  Can execute: {'Yes' if exe_check.get('executable', False) else 'No'}\n")
                if 'error' in exe_check:
                    f.write(f"  Error: {exe_check['error']}\n")
            else:
                f.write("  File exists: No\n")
                if 'error' in exe_check:
                    f.write(f"  Error: {exe_check['error']}\n")
            
            f.write("\nDependencies:\n")
            for dep, info in diagnostics['dependencies'].items():
                status = "Installed" if info.get('available', False) else "Missing"
                version = info.get('version', 'Unknown')
                f.write(f"  {dep}: {status}")
                if status == "Installed":
                    f.write(f" (Version: {version})")
                if 'error' in info:
                    f.write(f" - Error: {info['error']}")
                f.write("\n")
            
            f.write("\nEnvironment:\n")
            env = diagnostics['environment']
            f.write(f"  Python version: {env.get('python_version', 'Unknown')}\n")
            f.write(f"  Platform: {env.get('platform', 'Unknown')}\n")
            f.write(f"  Current directory: {env.get('cwd', 'Unknown')}\n")
            f.write(f"  Running as frozen app: {'Yes' if env.get('is_frozen', False) else 'No'}\n")
            f.write(f"  Running as admin: {'Yes' if env.get('is_admin', False) else 'No'}\n")
            f.write(f"  Documents folder writable: {'Yes' if env.get('documents_writable', False) else 'No'}\n")
            if not env.get('documents_writable', False) and 'documents_error' in env:
                f.write(f"    Error: {env['documents_error']}\n")
            
            f.write("\nPossible issues:\n")
            issues = []
            
            # Check for specific issues
            if not exe_check.get('exists', False):
                issues.append("- Executable file not found")
            elif not exe_check.get('executable', False):
                issues.append("- Executable file cannot be run")
            
            if not any(entry['type'] == 'registry' and 'HevolveAi' in entry['name'] for entry in diagnostics['startup_entries']):
                issues.append("- No registry startup entry found")
            
            if not any(entry['type'] == 'task' and 'HevolveAi' in entry.get('TaskName', '') for entry in diagnostics['startup_entries']):
                issues.append("- No scheduled task found")
            
            if not env.get('documents_writable', False):
                issues.append("- Cannot write to Documents folder")
            
            missing_deps = [dep for dep, info in diagnostics['dependencies'].items() if not info.get('available', False)]
            if missing_deps:
                issues.append(f"- Missing dependencies: {', '.join(missing_deps)}")
            
            if not issues:
                issues.append("- No obvious issues detected")
            
            for issue in issues:
                f.write(f"{issue}\n")
            
            f.write("\nRecommended fixes:\n")
            if "Executable file not found" in issues[0]:
                f.write("- Reinstall the application\n")
            elif "Executable file cannot be run" in issues[0]:
                f.write("- Make sure anti-virus is not blocking the application\n")
                f.write("- Try running the application manually with administrator rights once\n")
            
            if "No registry startup entry found" in ' '.join(issues) and "No scheduled task found" in ' '.join(issues):
                f.write("- Reinstall the application or manually add it to startup:\n")
                f.write(f"  - Create a shortcut to {diagnostics['exe_path']} in the startup folder\n")
                f.write(f"  - Or run: REG ADD HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run /v HevolveAiAgentCompanion /t REG_SZ /d \"\\\"{diagnostics['exe_path']}\\\" --background\" /f\n")
            
            if "Cannot write to Documents folder" in ' '.join(issues):
                f.write("- Check user permissions for the Documents folder\n")
            
            if missing_deps:
                f.write("- Reinstall the application to restore missing dependencies\n")
        
        print(f"Summary saved to: {summary_file}")
        
        return output_file, summary_file
    
    except Exception as e:
        error_path = os.path.join(os.path.expanduser("~"), "Documents", "hevolveai_diagnostic_error.txt")
        with open(error_path, "w") as f:
            f.write(f"Error running diagnostics: {str(e)}\n\n")
            f.write(traceback.format_exc())
        print(f"Error running diagnostics. Details saved to: {error_path}")
        return None, None

if __name__ == "__main__":
    run_diagnostics()