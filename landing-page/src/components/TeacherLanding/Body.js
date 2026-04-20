import Actions from './Actions';
import Welcome from './Welcome';

import React from 'react';
import './TeacherHome.css';

function Body() {
  return (
    <div className="body-section">
      <Welcome />
      <Actions />
    </div>
  );
}

export default Body;
