import React from 'react';
import {Link} from 'react-router-dom';

import './TeacherHome.css';
import {logger} from '../../utils/logger';

function Card({imgSrc, text, url}) {
  logger.log(url);
  return (
    <div className="card">
      <Link to={url}>
        <img src={imgSrc} alt="" />
        <h1>{text}</h1>
      </Link>
    </div>
  );
}

export default Card;
