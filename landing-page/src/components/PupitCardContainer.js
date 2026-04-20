import React, {useEffect, useState} from 'react';

import Card from './PupitCard';

import './Pupit.css';
import {mailerApi} from '../services/socialApi';
import {logger} from '../utils/logger';

const PupitCardContainer = () => {
  const [data, setData] = useState([]);
  const [filterData, setFilteredData] = useState([]);
  useEffect(() => {
    // mailerApi auto-unwraps response.data
    mailerApi
      .getFamousCharacters()
      .then((data) => {
        setData(data);
        setFilteredData(data);
      })
      .catch((error) => console.error(error));
  }, []);

  const handleChangeInput = (e) => {
    const keyword = e.target.value;
    const filtered = data.filter((item) =>
      item.image_name.toLowerCase().includes(keyword.toLowerCase())
    );
    logger.log(filtered);
    setFilteredData(filtered);
  };

  return (
    <>
      <div className="Container">
        <input
          className="input_Search"
          type="text"
          placeholder="Search by Character..."
          onChange={handleChangeInput}
        />
        <div className="PupitCardContainer">
          {filterData.map((item, index) => (
            <Card
              key={index}
              image={item.image_url}
              title={item.image_name}
              video={item.video_url}
              audio={item.audio_url}
            />
          ))}
        </div>
      </div>
    </>
  );
};

export default PupitCardContainer;
