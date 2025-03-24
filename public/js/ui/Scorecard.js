import { DomUtils } from '../utils/DomUtils.js';

export class Scorecard {
  constructor() {
    this.strokeDisplay = null;
    this.courseInfoDisplay = null;
    this.pars = [];
    this.currentCourse = 0;
    this.totalCourses = 0;
  }
  
  init() {
    this.createStrokeDisplay();
    this.createCourseInfoDisplay();
  }
  
  createStrokeDisplay() {
    this.strokeDisplay = DomUtils.createElement('div', {
      position: 'absolute',
      bottom: '10px',
      left: '10px',
      color: 'white',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '8px 12px',
      borderRadius: '5px',
      fontWeight: 'bold',
      zIndex: '100'
    }, 'Strokes: 0 / Par: 0');
    
    document.body.appendChild(this.strokeDisplay);
  }
  
  createCourseInfoDisplay() {
    this.courseInfoDisplay = DomUtils.createElement('div', {
      position: 'absolute',
      top: '10px',
      left: '20px',
      color: 'white',
      fontSize: '18px',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '10px',
      borderRadius: '5px'
    }, 'Hole 1');
    
    document.body.appendChild(this.courseInfoDisplay);
  }
  
  updateStrokes(strokeCount, par) {
    if (this.strokeDisplay) {
      this.strokeDisplay.textContent = `Strokes: ${strokeCount} / Par: ${par}`;
    }
  }
  
  updateCourseInfo(current, total, par) {
    this.currentCourse = current;
    this.totalCourses = total;
    
    // Store par for this course
    this.pars[current - 1] = par;
    
    if (this.courseInfoDisplay) {
      this.courseInfoDisplay.textContent = `Hole ${current} of ${total} - Par ${par}`;
    }
  }
  
  getTotalPar() {
    // Sum all pars
    return this.pars.reduce((total, par) => total + par, 0);
  }
  
  getScoreForCourse(course, strokesTaken) {
    const par = this.pars[course - 1] || 0;
    const difference = strokesTaken - par;
    
    if (difference < -2) return { name: 'Albatross', color: '#00FFFF' };
    if (difference === -2) return { name: 'Eagle', color: '#FFD700' };
    if (difference === -1) return { name: 'Birdie', color: '#00FF00' };
    if (difference === 0) return { name: 'Par', color: '#FFFFFF' };
    if (difference === 1) return { name: 'Bogey', color: '#FFA500' };
    if (difference === 2) return { name: 'Double Bogey', color: '#FF8C00' };
    return { name: `+${difference}`, color: '#FF0000' };
  }
}