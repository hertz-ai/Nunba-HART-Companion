"""indicator_window_tkinter.py - Fixed version with proper state management

NOTE: This module creates Tk windows, which on macOS MUST be on the main thread.
Since pywebview owns the main thread in the Nunba desktop app, this module is
skipped on macOS (guard in app.py). On Windows/Linux, Tk tolerates background
thread creation.
"""
import logging
import os
import threading
import time
import tkinter as tk

import requests

# Try to import pyautogui for screen detection
try:
    import pyautogui
    PYAUTOGUI_AVAILABLE = True
except Exception:
    # ImportError if missing, AttributeError if cv2.__version__ fails in frozen exe
    PYAUTOGUI_AVAILABLE = False

# Configure logging
user_docs = os.path.join(os.path.expanduser('~'), 'Documents')
log_dir = os.path.join(user_docs, 'HevolveAi Agent Companion', 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, 'indicator_window.log')

logging.basicConfig(
    filename=log_file,
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filemode='a'
)

logger = logging.getLogger('LLM_Control_Indicator_TK')

# Global variables
indicator_window = None
indicator_active = False
control_start_time = None
server_port = 5000

def get_screen_size():
    """Helper function to get screen size"""
    try:
        if PYAUTOGUI_AVAILABLE:
            width, height = pyautogui.size()
            logger.info(f"Got screen size from pyautogui: {width}x{height}")
            return width, height
        
        # Fallback using tkinter
        root = tk.Tk()
        width = root.winfo_screenwidth()
        height = root.winfo_screenheight()
        root.destroy()
        logger.info(f"Got screen size from tkinter: {width}x{height}")
        return width, height
        
    except Exception as e:
        logger.warning(f"Error detecting screen size: {str(e)}, using default")
        return 1920, 1080

class RibbonIndicator:
    def __init__(self, server_port=5000):
        self.server_port = server_port
        self.server_url = f'http://localhost:{server_port}'
        self.expanded = False
        self.is_animating = False  # Changed from is_expanding to is_animating
        self.ribbon_window = None
        self.panel_window = None
        self.start_time = time.time()
        self.timer_label = None
        self.auto_collapse_timer = None
        self.pulse_animation = None
        self.is_hovering = False
        self.animation_cancelled = False  # New flag to handle animation cancellation
        
        # Get screen dimensions
        self.screen_width, self.screen_height = get_screen_size()
        
        # Ribbon tab dimensions (only the pull tab, no bar)
        self.tab_width = 30       # Slightly larger pull tab
        self.tab_height = 12      # Tab height
        
        # Positioning (centered, near top)
        self.tab_x = (self.screen_width - self.tab_width) // 2
        self.tab_y = 8           # Very close to top edge
        
        # Expanded panel dimensions - larger and more modern
        self.panel_width = 320
        self.panel_height = 60
        self.panel_x = (self.screen_width - self.panel_width) // 2
        self.panel_y = self.tab_y + self.tab_height + 8
        
        # Create only the ribbon tab (no main bar)
        self.create_ribbon_tab()
    
    def create_ribbon_tab(self):
        """Create only the pull tab - no main ribbon bar"""
        try:
            # Create the pull tab window
            self.ribbon_window = tk.Tk()
            self.ribbon_window.title("AI Control Tab")
            self.ribbon_window.geometry(f"{self.tab_width}x{self.tab_height}+{self.tab_x}+{self.tab_y}")
            self.ribbon_window.overrideredirect(True)
            self.ribbon_window.attributes('-topmost', True)
            
            # Semi-transparent
            try:
                self.ribbon_window.attributes('-alpha', 0.85)
            except Exception:
                pass
            
            # Create a sleek tab design
            tab_frame = tk.Frame(self.ribbon_window, bg='#2F2F2F', relief='flat', bd=0)
            tab_frame.pack(fill=tk.BOTH, expand=True)
            
            # Tab indicator with modern styling
            tab_label = tk.Label(
                tab_frame,
                text="🔻",  # Lightning bolt to indicate AI control
                bg='#2F2F2F',
                fg='#FF5F57',  # Red color like in the HTML design
                font=('Segoe UI', 10, 'bold'),
                pady=0
            )
            tab_label.pack(expand=True)
            
            # Bind events to all components
            for widget in [self.ribbon_window, tab_frame, tab_label]:
                widget.bind('<Button-1>', self.toggle_panel)  # Changed to toggle_panel
                widget.bind('<Enter>', self.on_tab_hover_enter)
                widget.bind('<Leave>', self.on_tab_hover_leave)
            
            # Start subtle pulse animation
            self.start_tab_pulse()
            
            logger.info(f"Ribbon tab created at ({self.tab_x}, {self.tab_y})")
            
        except Exception as e:
            logger.error(f"Error creating ribbon tab: {str(e)}")
            raise
    
    def start_tab_pulse(self):
        """Subtle pulsing animation on the pull tab"""
        self.pulse_direction = 1
        self.pulse_alpha = 0.85
        self.animate_tab_pulse()
    
    def animate_tab_pulse(self):
        """Animate the tab pulsing"""
        if not self.ribbon_window or not self.ribbon_window.winfo_exists():
            return
            
        try:
            if self.is_hovering or self.expanded:
                self.ribbon_window.after(100, self.animate_tab_pulse)
                return
            
            # Gentle pulse between 0.6 and 0.85
            self.pulse_alpha += self.pulse_direction * 0.02
            
            if self.pulse_alpha >= 0.85:
                self.pulse_direction = -1
            elif self.pulse_alpha <= 0.6:
                self.pulse_direction = 1
            
            try:
                self.ribbon_window.attributes('-alpha', self.pulse_alpha)
            except Exception:
                pass
            
            # Slower pulse - every 100ms
            self.ribbon_window.after(100, self.animate_tab_pulse)
        except Exception as e:
            logger.error(f"Error in tab pulse animation: {str(e)}")
    
    def on_tab_hover_enter(self, event=None):
        """Tab hover effect"""
        try:
            self.is_hovering = True
            # Stop pulsing and brighten
            self.ribbon_window.attributes('-alpha', 1.0)
            
            # Change cursor to indicate it's clickable
            self.ribbon_window.config(cursor='hand2')
            
        except Exception as e:
            logger.error(f"Error on tab hover enter: {str(e)}")
    
    def on_tab_hover_leave(self, event=None):
        """Return tab to normal"""
        try:
            self.is_hovering = False
            self.ribbon_window.config(cursor='')
        except Exception as e:
            logger.error(f"Error on tab hover leave: {str(e)}")
    
    def toggle_panel(self, event=None):
        """Toggle the control panel - expand if collapsed, collapse if expanded"""
        # Prevent multiple rapid clicks during animation
        if self.is_animating:
            logger.info("Animation in progress, ignoring click")
            return
        
        if self.expanded:
            logger.info("Tab clicked - collapsing control panel")
            self.collapse_panel()
        else:
            logger.info("Tab clicked - expanding control panel")
            self.expand_panel()
    
    def expand_panel(self):
        """Expand the control panel"""
        try:
            if self.expanded or self.is_animating:
                return
                
            self.is_animating = True
            self.animation_cancelled = False
            
            # Change tab appearance to show it's active
            self.update_tab_appearance(active=True)
            
            # Create and animate the panel
            self.create_panel()
            
        except Exception as e:
            logger.error(f"Error expanding panel: {str(e)}")
            self.reset_animation_state()
    
    def collapse_panel(self):
        """Collapse the panel back to just the tab"""
        try:
            if not self.expanded or self.is_animating:
                return
                
            logger.info("Starting panel collapse")
            
            self.is_animating = True
            self.animation_cancelled = False
            
            # Cancel auto-collapse timer immediately
            if self.auto_collapse_timer:
                self.ribbon_window.after_cancel(self.auto_collapse_timer)
                self.auto_collapse_timer = None
            
            # Start collapse animation
            self.animate_collapse(self.panel_height)
            
        except Exception as e:
            logger.error(f"Error collapsing panel: {str(e)}")
            self.reset_animation_state()
    
    def update_tab_appearance(self, active=False):
        """Update tab appearance based on state"""
        try:
            if not self.ribbon_window or not self.ribbon_window.winfo_exists():
                return
                
            tab_frame = self.ribbon_window.winfo_children()[0]
            tab_label = tab_frame.winfo_children()[0]
            
            if active:
                tab_frame.config(bg='#1E1E1E')  # Darker when active
                tab_label.config(bg='#1E1E1E', text="🔺")  # Pin icon
            else:
                tab_frame.config(bg='#2F2F2F')
                tab_label.config(bg='#2F2F2F', text="🔻")
        except Exception as e:
            logger.error(f"Error updating tab appearance: {str(e)}")
    
    def reset_animation_state(self):
        """Reset animation state in case of errors"""
        self.is_animating = False
        self.animation_cancelled = True
        logger.info("Animation state reset")
    
    def create_panel(self):
        """Create the modern control panel"""
        try:
            # Create the panel window
            self.panel_window = tk.Toplevel(self.ribbon_window)
            self.panel_window.geometry(f"{self.panel_width}x0+{self.panel_x}+{self.panel_y}")  # Start with 0 height
            self.panel_window.overrideredirect(True)
            self.panel_window.attributes('-topmost', True)
            
            try:
                self.panel_window.attributes('-alpha', 0.95)
            except Exception:
                pass
            
            # Set up the panel content
            self.setup_modern_panel_content()
            
            # Animate the expansion
            self.animate_expand(0)
            
        except Exception as e:
            logger.error(f"Error creating panel: {str(e)}")
            self.reset_animation_state()
    
    def animate_expand(self, current_height):
        """Smooth expansion animation"""
        try:
            if self.animation_cancelled:
                logger.info("Expand animation cancelled")
                return
                
            target_height = self.panel_height
            step = 4  # Height increase per frame
            
            if current_height < target_height:
                current_height = min(current_height + step, target_height)
                if self.panel_window and self.panel_window.winfo_exists():
                    self.panel_window.geometry(f"{self.panel_width}x{current_height}+{self.panel_x}+{self.panel_y}")
                
                # Continue animation
                self.panel_window.after(15, lambda: self.animate_expand(current_height))
            else:
                # Animation complete
                self.expanded = True
                self.is_animating = False
                self.start_timer_updates()
                self.reset_auto_collapse_timer()
                logger.info("Panel expansion complete")
                
        except Exception as e:
            logger.error(f"Error in expand animation: {str(e)}")
            self.reset_animation_state()
    
    def animate_collapse(self, current_height):
        """Smooth collapse animation"""
        try:
            if self.animation_cancelled:
                logger.info("Collapse animation cancelled")
                return
                
            step = 5  # Height decrease per frame
            
            if current_height > 0:
                current_height = max(current_height - step, 0)
                if self.panel_window and self.panel_window.winfo_exists():
                    self.panel_window.geometry(f"{self.panel_width}x{current_height}+{self.panel_x}+{self.panel_y}")
                
                # Continue animation
                self.ribbon_window.after(10, lambda: self.animate_collapse(current_height))
            else:
                # Animation complete - destroy panel and reset state
                self.complete_collapse()
                
        except Exception as e:
            logger.error(f"Error in collapse animation: {str(e)}")
            self.complete_collapse()  # Ensure cleanup happens even on error
    
    def complete_collapse(self):
        """Complete the collapse operation and reset all state"""
        try:
            # Destroy panel window
            if self.panel_window:
                self.panel_window.destroy()
                self.panel_window = None
            
            # Clear widget references to prevent errors
            self.timer_label = None
            self.stop_button = None
            self.pulse_label = None
            
            # Reset tab appearance
            self.update_tab_appearance(active=False)
            
            # Reset state flags
            self.expanded = False
            self.is_animating = False
            
            logger.info("Panel collapsed successfully")
            
        except Exception as e:
            logger.error(f"Error in complete_collapse: {str(e)}")
            # Force reset state even if cleanup fails
            self.expanded = False
            self.is_animating = False
    
    def setup_modern_panel_content(self):
        """Set up the modern control panel content matching the HTML design"""
        try:
            # Main container with dark theme
            main_frame = tk.Frame(self.panel_window, bg='#1E1E1E', bd=1, relief='solid')
            main_frame.pack(fill=tk.BOTH, expand=True)
            
            # Create the toolbar
            toolbar = tk.Frame(main_frame, bg='#1E1E1E')
            toolbar.pack(fill=tk.BOTH, expand=True, padx=12, pady=8)
            
            # Left side - Timer section
            timer_frame = tk.Frame(toolbar, bg='#1E1E1E')
            timer_frame.pack(side=tk.LEFT, fill=tk.Y)
            
            # Timer icon and counter
            timer_container = tk.Frame(timer_frame, bg='#1E1E1E')
            timer_container.pack(side=tk.LEFT, pady=8)
            
            # Timer icon
            timer_icon = tk.Label(
                timer_container, 
                text="T", 
                bg='#1E1E1E', 
                fg='white', 
                font=('Segoe UI', 13, 'bold')
            )
            timer_icon.pack(side=tk.LEFT, padx=(0, 6))
            
            # Timer display
            self.timer_label = tk.Label(
                timer_container, 
                text="00:00", 
                bg='#1E1E1E', 
                fg='white', 
                font=('Segoe UI', 13, 'bold')
            )
            self.timer_label.pack(side=tk.LEFT)
            
            # Separator line
            separator = tk.Frame(toolbar, bg='#444444', width=1)
            separator.pack(side=tk.LEFT, fill=tk.Y, padx=12)
            
            # Right side - Stop button section
            button_frame = tk.Frame(toolbar, bg='#1E1E1E')
            button_frame.pack(side=tk.RIGHT, fill=tk.Y)
            
            # Stop button container
            stop_container = tk.Frame(button_frame, bg='#1E1E1E')
            stop_container.pack(side=tk.RIGHT, pady=6)
            
            # Pulse indicator
            self.pulse_label = tk.Label(
                stop_container,
                text="●",  # Bullet point as pulse
                bg='#1E1E1E',
                fg='#FF5F57',
                font=('Segoe UI', 8)
            )
            self.pulse_label.pack(side=tk.LEFT, padx=(0, 4))
            
            # Stop button
            self.stop_button = tk.Button(
                stop_container,
                text="Stop AI control",
                bg='#3C3C3C',
                fg='#FF5F57',
                font=('Segoe UI', 10, 'bold'),
                relief=tk.FLAT,
                bd=0,
                padx=12,
                pady=4,
                command=self.stop_ai_control,
                cursor='hand2'
            )
            self.stop_button.pack(side=tk.LEFT)
            
            # Collapse button (small X)
            collapse_button = tk.Button(
                stop_container,
                text="×",
                bg='#1E1E1E',
                fg='#666',
                font=('Segoe UI', 12, 'bold'),
                relief=tk.FLAT,
                bd=0,
                width=2,
                pady=4,
                command=self.collapse_panel,
                cursor='hand2'
            )
            collapse_button.pack(side=tk.RIGHT, padx=(8, 0))
            
            # Add hover effects with safety checks
            def on_stop_hover(e): 
                try:
                    if self.stop_button and self.stop_button.winfo_exists():
                        self.stop_button.config(bg='#505050')
                except Exception:
                    pass
            def on_stop_leave(e): 
                try:
                    if self.stop_button and self.stop_button.winfo_exists():
                        self.stop_button.config(bg='#3C3C3C')
                except Exception:
                    pass
            def on_collapse_hover(e): 
                try:
                    if collapse_button and collapse_button.winfo_exists():
                        collapse_button.config(fg='white')
                except Exception:
                    pass
            def on_collapse_leave(e): 
                try:
                    if collapse_button and collapse_button.winfo_exists():
                        collapse_button.config(fg='#666')
                except Exception:
                    pass
            
            self.stop_button.bind('<Enter>', on_stop_hover)
            self.stop_button.bind('<Leave>', on_stop_leave)
            collapse_button.bind('<Enter>', on_collapse_hover)
            collapse_button.bind('<Leave>', on_collapse_leave)
            
            # Start pulse animation for the pulse indicator
            self.start_pulse_animation()
            
            # Bind panel events for auto-collapse reset
            self.panel_window.bind('<Enter>', lambda e: self.reset_auto_collapse_timer())
            self.panel_window.bind('<Motion>', lambda e: self.reset_auto_collapse_timer())
            
        except Exception as e:
            logger.error(f"Error setting up panel content: {str(e)}")
    
    def start_pulse_animation(self):
        """Start the pulse animation for the indicator"""
        self.pulse_visible = True
        self.animate_pulse()
    
    def animate_pulse(self):
        """Animate the pulse indicator"""
        if (self.pulse_label and self.expanded and 
            self.panel_window and self.panel_window.winfo_exists() and
            self.pulse_label.winfo_exists()):
            try:
                # Toggle visibility for pulse effect
                if self.pulse_visible:
                    self.pulse_label.config(fg='#FF5F57')
                else:
                    self.pulse_label.config(fg='#AA3E39')  # Darker red for dimmed state
                
                self.pulse_visible = not self.pulse_visible
                
                # Schedule next pulse
                self.panel_window.after(750, self.animate_pulse)  # 1.5s cycle / 2
            except Exception as e:
                logger.error(f"Error in pulse animation: {str(e)}")
    
    def start_timer_updates(self):
        """Start updating the timer display"""
        self.update_timer()
    
    def update_timer(self):
        """Update the timer display"""
        if (self.timer_label and self.expanded and 
            self.panel_window and self.panel_window.winfo_exists() and
            self.timer_label.winfo_exists()):
            try:
                elapsed = int(time.time() - self.start_time)
                minutes = elapsed // 60
                seconds = elapsed % 60
                time_str = f"{minutes:02d}:{seconds:02d}"
                self.timer_label.config(text=time_str)
                
                # Schedule next update
                self.panel_window.after(1000, self.update_timer)
            except Exception as e:
                logger.error(f"Error updating timer: {str(e)}")
    
    def reset_auto_collapse_timer(self):
        """Reset the auto-collapse timer"""
        if not self.expanded:
            return
            
        try:
            if self.auto_collapse_timer:
                self.ribbon_window.after_cancel(self.auto_collapse_timer)
            
            # Auto collapse after 20 seconds
            self.auto_collapse_timer = self.ribbon_window.after(20000, self.collapse_panel)
        except Exception as e:
            logger.error(f"Error resetting auto-collapse timer: {str(e)}")
    
    def stop_ai_control(self):
        """Stop AI control via API"""
        logger.info("Stop button clicked")
        
        try:
            # Update button with safety check
            if self.stop_button and self.stop_button.winfo_exists():
                self.stop_button.config(
                    text="Stopping...", 
                    state=tk.DISABLED, 
                    bg='#646464', 
                    fg='white'
                )
            
            def call_stop_api():
                try:
                    response = requests.get(f"{self.server_url}/indicator/stop", timeout=10, headers={'Accept': 'application/json'})
                    
                    if response.status_code == 200:
                        data = response.json()
                        if data.get('success'):
                            def update_success():
                                try:
                                    if self.stop_button and self.stop_button.winfo_exists():
                                        self.stop_button.config(
                                            text="✓ Stopped", 
                                            bg='#28A745', 
                                            fg='white', 
                                            state=tk.NORMAL
                                        )
                                except Exception:
                                    pass
                            self.ribbon_window.after(0, update_success)
                            self.ribbon_window.after(2000, self.collapse_panel)
                        else:
                            raise Exception(data.get('error', 'Server reported failure'))
                    else:
                        raise Exception(f"Server responded with status {response.status_code}")
                        
                except Exception as e:
                    logger.error(f"Error calling stop API: {str(e)}")
                    def reset_button():
                        try:
                            if self.stop_button and self.stop_button.winfo_exists():
                                self.stop_button.config(
                                    text="Stop AI control", 
                                    bg='#3C3C3C', 
                                    fg='#FF5F57', 
                                    state=tk.NORMAL
                                )
                        except Exception:
                            pass
                    self.ribbon_window.after(0, reset_button)
            
            threading.Thread(target=call_stop_api, daemon=True).start()
            
        except Exception as e:
            logger.error(f"Error in stop button handler: {str(e)}")
    
    def show(self):
        """Show the ribbon tab"""
        try:
            if self.ribbon_window:
                self.ribbon_window.deiconify()
                self.ribbon_window.lift()
                logger.info("Ribbon tab shown")
        except Exception as e:
            logger.error(f"Error showing ribbon tab: {str(e)}")
    
    def hide(self):
        """Hide the ribbon tab"""
        try:
            # Cancel any ongoing animation
            self.animation_cancelled = True
            
            if self.panel_window:
                self.panel_window.destroy()
                self.panel_window = None
                
            # Reset state
            self.expanded = False
            self.is_animating = False
            
            if self.ribbon_window:
                self.ribbon_window.withdraw()
                logger.info("Ribbon tab hidden")
        except Exception as e:
            logger.error(f"Error hiding ribbon tab: {str(e)}")
    
    def destroy(self):
        """Destroy the ribbon tab"""
        try:
            self.animation_cancelled = True
            if self.panel_window:
                self.panel_window.destroy()
            if self.ribbon_window:
                self.ribbon_window.destroy()
            logger.info("Ribbon tab destroyed")
        except Exception as e:
            logger.error(f"Error destroying ribbon tab: {str(e)}")

# Global window reference
_indicator_window = None
_window_thread = None

def auto_hide_after_timeout(timeout_seconds=15.0):
    """Automatically hide the indicator after inactivity"""
    global indicator_active, control_start_time
    
    if globals().get('STANDALONE_TEST_MODE', False):
        logger.info("Auto-hide disabled in standalone test mode")
        while True:
            time.sleep(60)
    
    while True:
        time.sleep(1.0)
        try:
            if indicator_active and control_start_time:
                elapsed = time.time() - control_start_time
                if elapsed > timeout_seconds:
                    logger.info(f"Auto-hiding indicator after {elapsed:.1f}s of inactivity")
                    hide_indicator()
                    control_start_time = time.time()
        except Exception as e:
            logger.error(f"Error in auto-hide thread: {str(e)}")

def initialize_indicator(server_port=5000):
    """Initialize the ribbon indicator"""
    global _indicator_window, _window_thread
    try:
        if _indicator_window is None:
            def create_window():
                global _indicator_window
                _indicator_window = RibbonIndicator(server_port)
                _indicator_window.hide()  # Start hidden
                _indicator_window.ribbon_window.mainloop()
            
            _window_thread = threading.Thread(target=create_window, daemon=True)
            _window_thread.start()
            time.sleep(0.5)
            
        logger.info(f"Ribbon indicator initialized (server port: {server_port})")
        return True
    except Exception as e:
        logger.error(f"Error initializing ribbon indicator: {str(e)}")
        return False

def toggle_indicator(show=True, server_port=5000):
    """Toggle the ribbon visibility"""
    global indicator_active, control_start_time, _indicator_window
    
    try:
        if _indicator_window is None:
            initialize_indicator(server_port)
            time.sleep(0.5)
        
        if show and not indicator_active:
            _indicator_window.show()
            indicator_active = True
            control_start_time = time.time()
            logger.info("Ribbon indicator shown")
        elif not show and indicator_active:
            _indicator_window.hide()
            indicator_active = False
            logger.info("Ribbon indicator hidden")
        
        return indicator_active
    except Exception as e:
        logger.error(f"Error toggling ribbon indicator: {str(e)}")
        return indicator_active

def hide_indicator():
    """Hide the ribbon"""
    return toggle_indicator(False)

def show_indicator(server_port=5000):
    """Show the ribbon"""
    return toggle_indicator(True, server_port)

def get_status():
    """Get current status"""
    return {"active": indicator_active, "start_time": control_start_time}

def reset_timer():
    """Reset the control timer"""
    global control_start_time
    control_start_time = time.time()
    return control_start_time

def force_refresh_timer():
    """Force refresh the timer"""
    return reset_timer()

def get_activity_timeout():
    """Get activity timeout"""
    return 15.0

def is_indicator_visible():
    """Check if indicator is visible"""
    return indicator_active

# Start auto-hide thread
auto_hide_thread = threading.Thread(target=auto_hide_after_timeout, daemon=True)
auto_hide_thread.start()

# For testing
if __name__ == "__main__":
    STANDALONE_TEST_MODE = True
    
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    logging.getLogger().addHandler(console_handler)
    
    logger.info("Starting minimalist ribbon indicator test")
    
    # Create and show indicator
    indicator = RibbonIndicator(5000)
    indicator.show()
    
    logger.info("Ribbon tab should now be visible - look for the lightning bolt tab!")
    
    try:
        indicator.ribbon_window.mainloop()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        indicator.destroy()