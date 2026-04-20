import React, {useState} from 'react';

import close from '../../images/Teacher/close.png';
import hamburger from '../../images/Teacher/hamburger.png';
import logo from '../../images/Teacher/logo.gif';
import './TeacherHome.css';
import {logger} from '../../utils/logger';

function Header(props) {
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  logger.log(hamburgerOpen);

  return (
    <header className="header-container">
      <div className="logo">
        <img src={logo} alt="" />
        <span>EVOLVE</span>
      </div>
      {/* DESKTOP NAVBAR */}
      <div className={`nav-links desktop ${props.isBlack ? 'blackText' : ''}`}>
        <a href="/teacher/home">Home</a>
        <a href="/createBook">Books</a>
        <a href="/createCourse">Course</a>
        <a href="/createQA">Assessment</a>
        <a href="/teacher/prompt">Prompt</a>
        <a href="/teacher/home">Profile</a>
        <a href="/teacher/home">Students</a>
      </div>
      {/* MOBILE NAVBAR */}
      {hamburgerOpen && (
        <div className="nav-links mobile">
          <a href="/teacher/home">Home</a>
          <a href="/createBook">Books</a>
          <a href="/createCourse">Course</a>
          <a href="/createQA">Assessment</a>

          <a href="/teacher/home">Profile</a>
          <a href="/teacher/home">Students</a>
        </div>
      )}
      {hamburgerOpen ? (
        <img src={close} alt="" onClick={() => setHamburgerOpen(false)} />
      ) : (
        <img src={hamburger} alt="" onClick={() => setHamburgerOpen(true)} />
      )}
    </header>
  );
}

export default Header;
