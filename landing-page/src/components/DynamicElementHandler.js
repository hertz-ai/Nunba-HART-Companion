import {logger} from '../utils/logger';

import {SettingsInputAntenna} from '@mui/icons-material';
import {RemoveRounded, AddRounded} from '@mui/icons-material';
import {Autocomplete} from '@mui/lab';
import Alert from '@mui/lab/Alert';
import {Button} from '@mui/material';
import {Tooltip} from '@mui/material';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {set} from 'date-fns';
import React, {useState, Fragment, useEffect} from 'react';
import ReactDOM from 'react-dom';
import Select, {components} from 'react-select';

// import "bootstrap/dist/css/bootstrap.css";
import './TeacherLanding/TeacherHome.css';
import {mailerApi} from '../services/socialApi';

// Styles migrated from makeStyles to inline

const DynamicElementHandler = ({updateClient}) => {
  const [fileUploadIndex, setfileUploadIndex] = useState(0);
  const [APIs, setAPIList] = React.useState({name: '', is_active: true});
  const [inputFields, setInputFields] = useState([{name: '', is_active: true}]);

  const [alert, setAlert] = useState(false);
  const [alertContent, setAlertContent] = useState('');
  const [inputIds, setInputIds] = useState({
    data: [
      {
        book_name: '',
        subject_name: '',
        subject_id: 0,
        standard_name: '',
        standard_id: 0,
        board_name: '',
        board_id: 0,
        file_id: 0,
        is_active: true,
      },
    ],
  });
  const handleAddFields = () => {
    const values = [...inputFields];
    values.push({name: '', is_active: true});
    setInputFields(values);
  };

  const handleAddFieldsNew = () => {
    const val = [...inputIds['data']];
    val.push({
      book_name: '',
      subject_name: '',
      subject_id: 0,
      standard_name: '',
      standard_id: 0,
      board_name: '',
      board_id: 0,
      file_id: 0,
      is_active: true,
    });
    setInputIds({data: val});
    updateClient({data: val});

    logger.log('pushed the new set of values to inputIds[]');
  };

  // const handleRemoveFields = (index) => {
  //   const values = [...inputFields];
  //   if (values.length == 1) {
  //     alert('At least one ' + fieldname + ' is needed!!');
  //   } else {
  //     values.splice(index, 1);
  //     setInputFields(values);
  //   }
  // };

  const handleRemoveFieldsNew = (index) => {
    const val = [...inputIds['data']];
    if (val.length == 1) {
      alert('At least one entry is needed!!');
    } else {
      val.splice(index, 1);
      setInputIds({data: val});
      updateClient({data: val});
    }
  };

  const NoOptionsMessage = (props) => {
    return (
      <components.NoOptionsMessage {...props}>
        Book Not Available
      </components.NoOptionsMessage>
    );
  };

  const handleFileChange = (index, newValue) => {
    const cal = [...inputIds['data']];
    cal[index].file_id = newValue.file_id;
    subjectInputChange(index, newValue.subject);
    standardInputChange(index, newValue.standard);
    boardInputChange(index, newValue.board);
    cal[index].book_name = newValue.label;
    setInputIds({data: cal});
    updateClient({data: cal});
  };

  const subjectInputChange = (index, newValue) => {
    const val = [...inputIds['data']];
    for (let i = 0; i < subject.length; i++) {
      if (subject[i].name === newValue) {
        val[index].subject_id = subject[i].subject_id;
        val[index].subject_name = subject[i].name;
      }
    }
    setInputIds({data: val});
    updateClient({data: val});
  };

  const standardInputChange = (index, newValue) => {
    const val = [...inputIds['data']];
    for (let i = 0; i < standard.length; i++) {
      if (standard[i].standard === newValue) {
        val[index].standard_id = standard[i].standard_id;
        val[index].standard_name = standard[i].standard;
      }
    }
    setInputIds({data: val});
    updateClient({data: val});
  };

  const boardInputChange = (index, newValue) => {
    const val = [...inputIds['data']];
    for (let i = 0; i < board.length; i++) {
      if (board[i].board_name === newValue) {
        val[index].board_id = board[i].board_id;
        val[index].board_name = board[i].board_name;
      }
    }
    setInputIds({data: val});
    updateClient({data: val});
  };

  const handlesomething = (inp) => {
    for (let i = 0; i < subject.length; i++) {
      if (inp.toLowerCase() == subject[i].name.toLowerCase()) {
        return <></>;
      } else {
      }
    }
    return <>Creating new Subject</>;
  };
  const handlestandard = (inp) => {
    for (let i = 0; i < standard.length; i++) {
      if (inp.toLowerCase() == standard[i].standard.toLowerCase()) {
        return <></>;
      } else {
      }
    }
    return <>Creating new Standard</>;
  };
  const handleboard = (inp) => {
    for (let i = 0; i < board.length; i++) {
      if (inp.toLowerCase() == board[i].board_name.toLowerCase()) {
        return <></>;
      } else {
      }
    }
    return <>Creating new Board</>;
  };

  const handletextchange = (index, event) => {
    const values = [...inputIds['data']];
    if (event.target.name === 'standard_name') {
      values[index].standard_name = event.target.value.toLowerCase();
      values[index.standard_id] = 0;
      for (let i = 0; i < standard.length; i++) {
        if (
          standard[i].standard.toLowerCase() == event.target.value.toLowerCase()
        ) {
          values[index].standard_id = standard[i].standard_id;
          values[index].standard_name = event.target.value.toLowerCase();
          {
            break;
          }
        }
      }
    } else if (event.target.name === 'subject_name') {
      values[index].subject_name = event.target.value.toLowerCase();
      values[index].subject_id = 0;
      for (let i = 0; i < subject.length; i++) {
        if (
          subject[i].name.toLowerCase() === event.target.value.toLowerCase()
        ) {
          values[index].subject_id = subject[i].subject_id;
          values[index].subject_name = event.target.value.toLowerCase();
          {
            break;
          }
        }
      }
    } else if (event.target.name === 'board_name') {
      values[index].board_name = event.target.value;
      values[index].board_id = 0;
      for (let i = 0; i < board.length; i++) {
        if (
          board[i].board_name.toLowerCase() == event.target.value.toLowerCase()
        ) {
          values[index].board_id = board[i].board_id;
          values[index].board_name = event.target.value;
          {
            break;
          }
        }
      }
    } else if (event.target.name === 'book_name') {
      values[index].book_name = event.target.value;
    }
    setInputIds({data: values});
  };
  const [subject, setsubject] = useState([]);
  const [file, setFile] = useState([]);
  const [standard, setStanadrd] = useState([]);
  const [board, setBoard] = useState([]);
  const fetchSubject = async () => {
    mailerApi
      .getSubjects()
      .then((data) => {
        setsubject(data);
      })
      .catch((error) => {
        logger.log(error);
        setAlertContent('Unable to get subjects, please try again');
        setAlert(true);
      });
  };
  const fetchStandard = async () => {
    mailerApi
      .getStandards()
      .then((data) => {
        setStanadrd(data);
      })
      .catch((error) => {
        logger.log(error);
        setAlertContent('Unable to get standards, please try again');
        setAlert(true);
      });
  };
  const fetchBoard = async () => {
    mailerApi
      .getBoards()
      .then((data) => {
        setBoard(data);
      })
      .catch((error) => {
        logger.log(error);
        setAlertContent('Unable to get boards, please try again');
        setAlert(true);
      });
  };

  const fetchFiles = async () => {
    mailerApi
      .get('/getuniquefiles')
      .then((data) => {
        const opt = [];
        for (let i = 0; i < data.length; i++) {
          let sub1 = '';
          let stan1 = '';
          let boar1 = '';
          const sub = data[i].FileName.split('-')[1];
          const labe = data[i].FileName.split('-')[0];
          const stand = data[i].FileName.split('-')[2];
          const boarr = data[i].FileName.split('-')[3];
          const pubyear = data[i].FileName.split('-')[4];
          const author = data[i].FileName.split('-')[5];
          const file_id = data[i].FileID;
          if (!isNaN(sub)) {
            sub1 = 'NA';
            for (let j = 0; j < subject.length; j++) {
              if (subject[j].subject_id == sub) {
                sub1 = subject[j].name;
                {
                  break;
                }
              } else {
                sub1 = 'NA';
              }
            }
          } else {
            sub1 = sub;
          }
          if (!isNaN(stand)) {
            stan1 = 'NA';
            for (let j = 0; j < standard.length; j++) {
              if (standard[j].standard_id == stand) {
                stan1 = standard[j].standard;
                {
                  break;
                }
              } else {
                stan1 = 'NA';
              }
            }
          } else {
            stan1 = stand;
          }
          if (!isNaN(boarr)) {
            boar1 = 'NA';
            for (let j = 0; j < board.length; j++) {
              if (board[j].board_id == boarr) {
                boar1 = board[j].board_name;
                {
                  break;
                }
              }
              boar1 = 'NA';
            }
          } else {
            boar1 = boarr;
          }
          opt.push({
            label: labe,
            subject: sub1,
            standard: stan1,
            board: boar1,
            pubyear: pubyear,
            author: author,
            file_id: file_id,
          });
        }
        setFile(opt);
      })
      .catch((error) => {
        logger.log(error);
        setAlertContent('Unable to get files, please try again');
        setAlert(true);
      });
  };
  useEffect(() => {
    fetchSubject();
    fetchStandard();
    fetchBoard();
  }, []);
  useEffect(() => {
    fetchFiles();
  }, [board]);
  const defaultProps = {
    options: file,
    getOptionLabel: (option) => option.label,
  };

  return (
    <>
      {/* <h1>Dynamic Form Fields in React</h1> */}
      {/* <Typography component="h1" variant="h6">
        Courses Offered
      </Typography> */}
      {/* <form onSubmit={handleSubmit}> */}
      <div role="form" className="form-horizontal">
        <div className="form-row createBookresponsive">
          {inputIds['data'].map((inputField, index) => (
            <React.Fragment key={`${inputField}~${index}`}>
              <Grid
                container
                spacing={2}
                className="form-group  createBookresponsive col-md-12"
              >
                {/* <input
                  type="text"
                  className="form-control"
                  id="courseName"
                  name="courseName"
                  value={inputField.name}
                  onChange={(event) => handleInputChange(index, event)}
                /> */}
                <Grid item xs={2}>
                  <Autocomplete
                    id="file_name"
                    className="createBooktext"
                    disableClearable
                    required
                    {...defaultProps}
                    renderOption={({
                      label,
                      subject,
                      standard,
                      board,
                      pubyear,
                      author,
                      ...props
                    }) => {
                      return (
                        <div>
                          <Tooltip
                            title={`
                          Book Name :-${label}
                          Subject   :-${subject}
                          Standard   :-${standard}
                          Board      :-${board}
                          Publish year:-${pubyear}
                          Author     :-${author}`}
                            placement="right"
                          >
                            <div>
                              <Button {...props} fullWidth>
                                {label}
                              </Button>
                            </div>
                          </Tooltip>
                        </div>
                      );
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        name="file_name"
                        id="file_name"
                        label="Select a File"
                      />
                    )}
                    onChange={(event, newValue) =>
                      handleFileChange(index, newValue)
                    }
                  />
                </Grid>
                <Grid item xs={2}>
                  <Autocomplete
                    id="subject_name"
                    freeSolo
                    disableClearable
                    options={subject.map((option) => option.name)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        name="subject_name"
                        required
                        // ={(event)=>handletextchange(index,event)}
                        onBlur={(event) => handletextchange(index, event)}
                        InputProps={{
                          ...params.InputProps,
                          type: 'search',
                        }}
                        id="subject_name"
                        label="Subject"
                      />
                    )}
                    onChange={(event, newValue) =>
                      subjectInputChange(index, newValue)
                    }
                    value={inputField.subject_name}
                  />
                </Grid>
                <Grid item xs={2}>
                  <Autocomplete
                    id="standard_name"
                    freeSolo
                    disableClearable
                    options={standard.map((option) => option.standard)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        name="standard_name"
                        required
                        onChange={(event) => handletextchange(index, event)}
                        InputProps={{
                          ...params.InputProps,
                          type: 'search',
                        }}
                        id="standard_name"
                        label="Standard/Semester"
                      />
                    )}
                    onChange={(event, newValue) =>
                      standardInputChange(index, newValue)
                    }
                    value={inputField.standard_name}
                  />
                </Grid>
                <Grid item xs={2}>
                  <TextField
                    autoComplete="book_name"
                    name="book_name"
                    required
                    id="book_name"
                    label="Book Name"
                    onChange={(event) => handletextchange(index, event)}
                    value={inputField.book_name}
                  />
                </Grid>
                <Grid item xs={2}>
                  <Autocomplete
                    id="board_name"
                    freeSolo
                    disableClearable
                    options={board.map((option) => option.board_name)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        name="board_name"
                        required
                        onChange={(event) => handletextchange(index, event)}
                        InputProps={{
                          ...params.InputProps,
                          type: 'search',
                        }}
                        id="board_name"
                        label="Board"
                      />
                    )}
                    onChange={(event, newValue) =>
                      boardInputChange(index, newValue)
                    }
                    value={inputField.board_name}
                  />
                </Grid>
                {/* <label>
                  <FontAwesomeIcon
                    title="upload a book"
                    icon={faBookOpen}
                    color="#0078ff"
                    size="lg"
                    className={classes.avatar}
                    // onClick={document.getElementById('demo-input-image').click()}
                    onClick={(event) => triggerImgUpload(index, event)}
                  ></FontAwesomeIcon>
                </label> */}
                <Grid item xs={2}>
                  {/*
                <FormControlLabel
                  control={
                    <FontAwesomeIcon
                    title="upload a book"
                    icon={faFileUpload}
                    color="#0078ff"
                    size="lg"
                    className={classes.avatar}
                    // onClick={document.getElementById('demo-input-image').click()}
                    onClick={(event) => triggerImgUpload(index, event)}
                  ></FontAwesomeIcon>
                  }
                  onClick={(event) => triggerImgUpload(index, event)}
                  label="Upload a Book"
                />

                <input
                  type="file"
                  accept="image/*, application/pdf"
                  id="demo-input-image"
                  className={classes.visuallyHidden}
                  // onClick={(event) => (event.target.value = '')}
                  //onClick={(event) => alert('index -> ' + index)}
                  onChange={(event) =>
                    handleImageUpload(fileUploadIndex, event)
                  }
                />*/}

                  <AddRounded
                    fontSize="large"
                    onClick={() => handleAddFieldsNew()}
                    style={{cursor: 'pointer'}}
                    color="primary"
                  />
                  <RemoveRounded
                    fontSize="large"
                    onClick={() => handleRemoveFieldsNew(index)}
                    style={{cursor: 'pointer'}}
                    color="primary"
                  />
                </Grid>
                {/* </div>
                <div className="form-group col-sm-2"> */}
                {/* <button
                  className="btn btn-link"
                  type="button"
                  onClick={() => handleRemoveFields(index)}
                >
                  -
                </button> */}
              </Grid>
              <Grid item xs={2}></Grid>
              <Grid item xs={2}>
                {inputField.subject_name.length !== 0
                  ? handlesomething(inputField.subject_name)
                  : null}
              </Grid>
              <Grid item xs={2}>
                {inputField.standard_name.length !== 0
                  ? handlestandard(inputField.standard_name)
                  : null}
              </Grid>
              <Grid item xs={2}></Grid>
              <Grid item xs={2}>
                {inputField.board_name.length !== 0
                  ? handleboard(inputField.board_name)
                  : null}
              </Grid>
              <br />
            </React.Fragment>
          ))}

          {alert ? <Alert severity="error">{alertContent}</Alert> : <></>}
        </div>

        {/* <div className="submit-button">
          <button
            className="btn btn-primary mr-2"
            type="submit"
            onSubmit={handleSubmit}
          >
            Save
          </button>
        </div>
        <br /> */}

        {/* <pre>{JSON.stringify(inputFieldsNew, null, 2)}</pre> */}
      </div>
    </>
  );
};

export default DynamicElementHandler;
