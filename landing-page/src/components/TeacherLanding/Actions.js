import React from 'react';

import './TeacherHome.css';
import Card from './Card';

import CreateCourse from '../../images/Teacher/bookPhoto.jpeg';
import reviwPhoto from '../../images/Teacher/reviwPhoto.jpeg';
import schedulePhoto from '../../images/Teacher/schedulePhoto.jpeg';
import taskPhoto from '../../images/Teacher/taskPhoto.jpeg';
import upLoadPhoto from '../../images/Teacher/uploadPhoto.jpeg';

function Actions() {
  return (
    <div className="actions-container">
      <h1 style={{color: 'white', fontSize: '2rem'}}>ACTIONS</h1>
      <div className="card-container">
        <Card text="Upload Notes" imgSrc={upLoadPhoto} url="/createCourse" />
        <Card text="Generate Assessment" imgSrc={taskPhoto} url="/createQA" />
        <Card text="Generate Course," imgSrc={CreateCourse} url="/createBook" />
        <Card
          text="Schedule Assessment"
          imgSrc={schedulePhoto}
          url="/ScheduleAssessment"
        />
        <Card text="Review Q & A" imgSrc={reviwPhoto} url="/reviewQA" />
      </div>
    </div>
  );
}

export default Actions;
