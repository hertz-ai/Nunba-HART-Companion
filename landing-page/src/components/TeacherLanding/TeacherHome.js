import React, {useState, useEffect, useRef} from 'react';
import * as THREE from 'three';
import HALO from 'vanta/dist/vanta.halo.min.js';
import './TeacherHome.css';
import {useNavigate} from 'react-router-dom';

import Header from './Header';
import Body from './Body';
import Footer from './Footer';

const TeacherHome = () => {
  const navigate = useNavigate();
  const [vantaEffect, setVantaEffect] = useState(0);

  const myRef = useRef(null);

  useEffect(() => {
    const access_token = localStorage.getItem('hevolve_access_token');
    // TODO - verify the access token
    if (access_token != null) {
      if (access_token.trim().length == 0) {
        navigate('/teacher/signin');
      }
    } else {
      navigate('/teacher/signin');
    }
    if (!vantaEffect) {
      setVantaEffect(
        HALO({
          el: myRef.current,
          THREE: THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,

          minHeight: 200.0,
          minWidth: 200.0,
          scale: 1.0,
          scaleMobile: 1.0,
          color: 0xfff33f,
        })
      );
    }
    return () => {
      if (vantaEffect) vantaEffect.destroy();
    };
  }, [vantaEffect]);

  return (
    <div
      className="TeacherHome"
      style={{height: '100%', width: '100%'}}
      ref={myRef}
    >
      <Header />
      <Body />
      <Footer />
    </div>
  );
};

export default TeacherHome;
