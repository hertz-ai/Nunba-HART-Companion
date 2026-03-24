import os
import subprocess
import sys
import tempfile
import urllib.request
import zipfile


def download_file(url, save_path):
    """Download a file from URL to the specified path"""
    print(f"Downloading {url} to {save_path}...")
    urllib.request.urlretrieve(url, save_path)
    print("Download complete!")

def main():
    # Create the embedded Python directory
    embed_dir = "python-embed"
    os.makedirs(embed_dir, exist_ok=True)
    
    # Download Python 3.10.11 embedded package
    py_embed_url = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip"
    py_embed_zip = os.path.join(tempfile.gettempdir(), "python-3.10.11-embed-amd64.zip")
    
    # Download get-pip.py
    get_pip_url = "https://bootstrap.pypa.io/get-pip.py"
    get_pip_py = os.path.join(tempfile.gettempdir(), "get-pip.py")
    
    try:
        # Download Python embedded package
        if not os.path.exists(py_embed_zip):
            download_file(py_embed_url, py_embed_zip)
        
        # Extract Python embedded package
        print(f"Extracting Python embedded package to {embed_dir}...")
        with zipfile.ZipFile(py_embed_zip, 'r') as zip_ref:
            zip_ref.extractall(embed_dir)
        
        # Modify python310._pth to include site-packages
        pth_file = os.path.join(embed_dir, "python310._pth")
        with open(pth_file) as f:
            content = f.read()
        
        # Uncomment import site
        if "#import site" in content:
            content = content.replace("#import site", "import site")
        
        with open(pth_file, 'w') as f:
            f.write(content)
        
        # Download get-pip.py
        if not os.path.exists(get_pip_py):
            download_file(get_pip_url, get_pip_py)
        
        # Install pip
        python_exe = os.path.join(embed_dir, "python.exe")
        print("Installing pip...")
        subprocess.run([python_exe, get_pip_py, "--no-warn-script-location"], check=True)
        
        # Install required packages
        print("Installing required packages...")
        subprocess.run([
            os.path.join(embed_dir, "Scripts", "pip.exe"), 
            "install", 
            "pyautogui",
            "pillow",
            "pyperclip",
            "keyboard",
            "requests",
            "--no-warn-script-location"
        ], check=True)
        
        print("\nEmbedded Python setup complete!")
        print(f"Python embedded directory: {os.path.abspath(embed_dir)}")
        
    except Exception as e:
        print(f"Error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())