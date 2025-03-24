export class DomUtils {
    /**
     * Create a DOM element with specified styles and content
     * @param {string} tagName - The HTML tag name
     * @param {Object} styles - Object containing CSS styles
     * @param {string} content - Content to put inside the element
     * @returns {HTMLElement} The created element
     */
    static createElement(tagName, styles = {}, content = '') {
      const element = document.createElement(tagName);
      
      // Apply styles
      Object.entries(styles).forEach(([property, value]) => {
        element.style[property] = value;
      });
      
      // Set content
      if (content) {
        element.textContent = content;
      }
      
      return element;
    }
    
    /**
     * Create a popup that will auto-dismiss after a duration
     * @param {Object} options - Popup options
     * @param {string} options.title - Popup title
     * @param {string} options.content - HTML content of the popup
     * @param {number} options.duration - Duration in ms before auto-dismissal
     * @returns {HTMLElement} The popup element
     */
    static createPopup(options) {
      const { title, content, duration = 3000 } = options;
      
      const popup = this.createElement('div', {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: 'white',
        fontSize: '24px',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: '20px 40px',
        borderRadius: '10px',
        textAlign: 'center',
        zIndex: '1000'
      });
      
      popup.innerHTML = `
        <div>${title || 'Notice'}</div>
        ${content}
      `;
      
      document.body.appendChild(popup);
      
      // Auto-remove after duration
      if (duration > 0) {
        setTimeout(() => {
          if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
          }
        }, duration);
      }
      
      return popup;
    }
    
    /**
     * Show a toast message at the bottom of the screen
     * @param {string} message - Message to display
     * @param {number} duration - Duration in ms
     * @returns {HTMLElement} The toast element
     */
    static showToast(message, duration = 2000) {
      const toast = this.createElement('div', {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px 20px',
        borderRadius: '4px',
        fontSize: '16px',
        fontFamily: 'Arial, sans-serif',
        zIndex: '10000',
        transition: 'opacity 0.3s'
      }, message);
      
      document.body.appendChild(toast);
      
      // Fade out and remove
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }, duration);
      
      return toast;
    }
    
    /**
     * Create a dialog with OK/Cancel buttons
     * @param {Object} options - Dialog options
     * @param {string} options.title - Dialog title
     * @param {string} options.message - Dialog message
     * @param {Function} options.onConfirm - Callback when OK is clicked
     * @param {Function} options.onCancel - Callback when Cancel is clicked
     * @returns {HTMLElement} The dialog element
     */
    static createDialog(options) {
      const { title, message, onConfirm, onCancel } = options;
      
      const overlay = this.createElement('div', {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: '10000'
      });
      
      const dialog = this.createElement('div', {
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        maxWidth: '400px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)'
      });
      
      const titleEl = this.createElement('h3', {
        margin: '0 0 10px 0',
        color: '#333'
      }, title || 'Confirm');
      
      const messageEl = this.createElement('p', {
        margin: '0 0 20px 0',
        color: '#666'
      }, message || 'Are you sure?');
      
      const buttonContainer = this.createElement('div', {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px'
      });
      
      const cancelButton = this.createElement('button', {
        padding: '8px 16px',
        backgroundColor: '#f1f1f1',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }, 'Cancel');
      
      const okButton = this.createElement('button', {
        padding: '8px 16px',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }, 'OK');
      
      // Events
      cancelButton.addEventListener('click', () => {
        document.body.removeChild(overlay);
        if (onCancel) onCancel();
      });
      
      okButton.addEventListener('click', () => {
        document.body.removeChild(overlay);
        if (onConfirm) onConfirm();
      });
      
      // Assemble dialog
      buttonContainer.appendChild(cancelButton);
      buttonContainer.appendChild(okButton);
      
      dialog.appendChild(titleEl);
      dialog.appendChild(messageEl);
      dialog.appendChild(buttonContainer);
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      return overlay;
    }
  }