import logo_dark from './../images/logo-dark.png';
import Spacer from './Spacer';
import Header from './TeacherLanding/Header';

import {mailerApi} from '../services/socialApi';
import {logger} from '../utils/logger';

import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {RemoveRounded, AddRounded} from '@mui/icons-material';
import {Autocomplete} from '@mui/lab';
import Alert from '@mui/lab/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import {green, purple} from '@mui/material/colors';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import {withStyles, useTheme} from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import React, {useState, useEffect} from 'react';

// import {faUserPlus, faSearch} from '@fortawesome/fontawesome-free';

import {useNavigate} from 'react-router-dom';
import {useLocation} from 'react-router-dom';
import Select, {components} from 'react-select';

import './TeacherLanding/TeacherHome.css';

const sxStyles = {
  paper: {
    marginTop: '64px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
};

const ColorButton = withStyles((theme) => ({
  root: {
    width: '70%',
    color: theme.palette.getContrastText(purple[500]),
    // color: "linear-gradient(to right, #00e89d, #0078ff)",
    background: 'linear-gradient(to right, #00e89d, #0078ff)',
    // backgroundColor: purple[500],
    '&:hover': {
      backgroundColor: purple[700],
    },
    '&:focus': {
      outline: 'none',
    },
  },
}))(Button);

function Copyright() {
  return (
    <Typography variant="body2" color="textSecondary" align="center">
      {'Copyright © '}
      <Link color="inherit" href="https://hertzai.com/">
        HertzAI
      </Link>{' '}
      {new Date().getFullYear()}
      {'.'}
    </Typography>
  );
}

// ####
export default function CreateCourse() {
  const location = useLocation();
  const navigate = useNavigate();
  const [alert, setAlert] = useState(false);
  const [alertContent, setAlertContent] = useState('');

  const theme = useTheme();

  const ITEM_HEIGHT = 48;
  const ITEM_PADDING_TOP = 8;
  const MenuProps = {
    PaperProps: {
      style: {
        maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
        width: 250,
      },
    },
  };
  {
    /* ------------dynamic element starts*/
  }
  const [inputFieldsNew, setInputFieldsNew] = useState({
    data: [
      {
        book_name: '',
        book_id: 0,
        course_name: '',
        course_id: 0,
        batch_name: '',
        batch_id: 0,
        is_active: true,
      },
    ],
  });
  const [course, setCourse] = useState([]);
  const [book, setBook] = useState([]);
  const [batch, setBatch] = useState([]);
  const fetchCourse = async () => {
    mailerApi
      .getCourses()
      .then((data) => {
        setCourse(data);
      })
      .catch((error) => {
        logger.log(error);
        setAlertContent('unable to get Course,please try again');
        setAlert(true);
      });
  };
  const fetchBook = () => {
    mailerApi
      .getBooks()
      .then((data) => {
        setBook(data);
      })
      .catch((error) => {
        logger.log(error);
        setAlertContent('unable to get Book,please try again');
        setAlert(true);
      });
  };
  const fetchbatch = () => {
    mailerApi
      .getBatch()
      .then((data) => {
        setBatch(data);
      })
      .catch((error) => {
        logger.log(error);
        setAlertContent('unable to get Batch,please try again');
        setAlert(true);
      });
  };
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
    fetchCourse();
    fetchBook();
    fetchbatch();
  }, []);
  const [bookOption, setBookOption] = useState([[]]);
  const handleAddFieldsNew = () => {
    logger.log('Entered handleAddFieldnew()');
    const values = [...inputFieldsNew['data']];
    values.push({
      book_name: '',
      book_id: 0,
      course_name: '',
      course_id: 0,
      batch_name: '',
      batch_id: 0,
      is_active: true,
    });
    setInputFieldsNew({data: values});
    setBookOption([...bookOption, []]);
    updateClient({data: values});
  };

  const handleRemoveFieldsNew = (index) => {
    const values = [...inputFieldsNew['data']];
    const val = [...bookOption];
    if (values.length == 1) {
      alert('At least one entry is needed!!');
    } else {
      values.splice(index, 1);
      val.splice(index, 1);
      setBookOption(val);
      setInputFieldsNew({data: values});
      updateClient({data: values});
    }
  };
  const handletextchange = (index, event) => {
    logger.log('Entered handletextchange()');
    const values = [...inputFieldsNew['data']];
    if (event.target.name == 'course_name') {
      for (let i = 0; i < course.length; i++) {
        if (course[i].name.toLowerCase() == event.target.value.toLowerCase()) {
          values[index].course_id = course[i].course_id;
          values[index].course_name = event.target.value;
          {
            break;
          }
        } else {
          values[index].course_name = event.target.value;
          values[index].course_id = 0;
        }
      }
    } else if (event.target.name == 'batch_name') {
      for (let i = 0; i < batch.length; i++) {
        if (batch[i].name.toLowerCase() == event.target.value.toLowerCase()) {
          values[index].batch_id = batch[i].batch_id;
          values[index].batch_name = event.target.value;
          {
            break;
          }
        } else {
          values[index].batch_name = event.target.value;
          values[index].batch_id = 0;
        }
      }
    }

    setInputFieldsNew({data: values});
    updateClient({data: values});
  };
  const handleBookChange = (index, newValue) => {
    logger.log('Entered handlebookchange()');
    const values = [...inputFieldsNew['data']];
    for (let i = 0; i < book.length; i++) {
      if (book[i].name.toLowerCase() == newValue.toLowerCase()) {
        values[index].book_id = book[i].book_id;
        values[index].book_name = newValue;
      }
    }
    setInputFieldsNew({data: values});
    updateClient({data: values});
  };
  const courseInputChange = (index, newValue) => {
    logger.log('Entered courseInputChange()');
    const values = [...inputFieldsNew['data']];
    values[index].course_name = newValue;
    setInputFieldsNew({data: values});
    updateClient({data: values});
  };
  const batchInputChange = (index, newValue) => {
    logger.log('Entered batchInputChange()');
    const values = [...inputFieldsNew['data']];
    values[index].batch_name = newValue;
    setInputFieldsNew({data: values});
    updateClient({data: values});
  };
  const handleInputChangeNew = (index, event) => {
    logger.log('Entered handleInputChangeNew()');
    logger.log('course_id ->' + event.course_id);
    logger.log('event.value -> ' + event.label);
    const values = [...inputFieldsNew['data']];
    values[index].course_name = event.label;
    setInputFieldsNew({data: values});
    updateClient({data: values});
    mailerApi.get(`/getbook/${event.course_id}`).then((data) => {
      const val = [...bookOption];
      for (let i = 0; i < data.length; i++) {
        val[index].push({
          label: data[i].name,
          value: data[i].name,
          book_id: data[i].book_id,
        });
      }
      setBookOption(val);
    });
  };

  {
    /* ------------search drop down starts----------------------*/
  }
  const [courseBatchBooks, setCourseBatchBookList] = React.useState({
    data: [
      {
        book_name: '',
        book_id: 0,
        course_name: '',
        course_id: 0,
        batch_name: '',
        batch_id: 0,
        is_active: true,
      },
    ],
  });

  const updateClient = (data) => {
    setCourseBatchBookList(data);
  };

  const clearAccessToken = (event) => {
    event.preventDefault();
    localStorage.setItem('hevolve_access_token', '');
    navigate('/signin');
  };

  const NoOptionsMessage = (props) => {
    return (
      <div {...props}>
        <Button
          variant="contained"
          style={{width: 'auto'}}
          onMouseDown={() => {
            navigate('/createBook');
          }}
        >
          Create a Book
        </Button>
      </div>
    );
  };

  const handlesomething = (inp) => {
    for (let i = 0; i < course.length; i++) {
      if (inp.toLowerCase() == course[i].name.toLowerCase()) {
        return <></>;
      } else {
      }
    }
    return <>Creating new course</>;
  };
  const handlebatch = (inp) => {
    for (let i = 0; i < batch.length; i++) {
      if (inp.toLowerCase() == batch[i].name.toLowerCase()) {
        return <></>;
      } else {
      }
    }
    return <>Creating new course</>;
  };
  const postData = (event) => {
    event.preventDefault();
    logger.log('Entered postData()');
    for (let i = 0; i < courseBatchBooks.data.length; i++) {
      if (courseBatchBooks.data[i].book_id == 0) {
        logger.log('Select a Book for course');
        alert(
          'Select a book for course ' + courseBatchBooks.data[i].course_name
        );
        return null;
      }
    }

    const courseObj = {
      courseBatchBooks_offered: courseBatchBooks.data,
      client_id: 1,
    };

    mailerApi
      .createCourse(courseObj)
      .then((data) => {
        logger.log('Completed setting state!!');
        window.location.reload(false);
      })
      .catch((error) => {
        logger.log('Looks like there was a problem:', error);
      });
  };
  return (
    <React.Fragment>
      <Header isBlack={true} />
      <form onSubmit={postData}>
        <Container component="main" maxWidth="md">
          <Box sx={sxStyles.paper}>
            <div style={{paddingBottom: '20px'}}>
              {/* <div> */}

              {/* <Typography component="h1" variant="h5">
                Review Assessment
            </Typography> */}
              <Typography component="h2" variant="h3" align={'center'}>
                Select a Course
              </Typography>
              {/* <Avatar className={classes.avatar}>
          <LockOutlinedIcon />
        </Avatar> */}
            </div>
          </Box>
          {inputFieldsNew['data'].map((inputField, index) => (
            <React.Fragment key={`${inputField}~${index}`}>
              <div>
                <Grid
                  item
                  xs={12}
                  className="responsive"
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    rowSpacing: 1,
                    paddingBottom: 15,
                  }}
                >
                  <Autocomplete
                    id="course_name"
                    freeSolo
                    disableClearable
                    className="col-3 text_responsive "
                    options={course.map((option) => option.name)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        name="course_name"
                        required
                        onBlur={(event) => handletextchange(index, event)}
                        InputProps={{
                          ...params.InputProps,
                          type: 'search',
                        }}
                        id="course_name"
                        label="Course Name"
                      />
                    )}
                    onChange={(event, newValue) =>
                      courseInputChange(index, newValue)
                    }
                    value={inputField.course_name}
                  />
                  {/* <Select
                defaultValue={selectedBook}
                onChange={handleBookChange}
                required
                components={{ NoOptionsMessage }}
                options={bookOption[index]}
                placeholder='Select Book'
                className='col-3'
              />*/}
                  <Autocomplete
                    id="book_name"
                    disableClearable
                    className="col-3 text_responsive"
                    noOptionsText={<NoOptionsMessage />}
                    required
                    options={book.map((option) => option.name)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        name="book_name"
                        id="book_name"
                        label="Select a Book"
                      />
                    )}
                    onChange={(event, newValue) =>
                      handleBookChange(index, newValue)
                    }
                  />
                  <Autocomplete
                    id="batch_name"
                    freeSolo
                    disableClearable
                    className="col-3 text_responsive"
                    options={batch.map((option) => option.name)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        name="batch_name"
                        required
                        onBlur={(event) => handletextchange(index, event)}
                        InputProps={{
                          ...params.InputProps,
                          type: 'search',
                        }}
                        id="batch_name"
                        label="Batch Name"
                      />
                    )}
                    onChange={(event, newValue) =>
                      batchInputChange(index, newValue)
                    }
                    value={inputField.batch_name}
                  />
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
                <Grid
                  item
                  xs={12}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    rowSpacing: 1,
                    paddingBottom: 15,
                  }}
                >
                  <Grid item xs={3}>
                    {inputField.course_name.length !== 0 ? (
                      handlesomething(inputField.course_name)
                    ) : (
                      <></>
                    )}
                  </Grid>
                  <Grid item xs={3}></Grid>
                  <Grid item xs={3}>
                    {inputField.batch_name.length !== 0 ? (
                      handlebatch(inputField.batch_name)
                    ) : (
                      <></>
                    )}
                  </Grid>
                </Grid>
              </div>
            </React.Fragment>
          ))}
          <Spacer h={40} />
          <ColorButton
            variant="contained"
            color="primary"
            type="submit"
            style={{marginLeft: '15%'}}
          >
            Submit
          </ColorButton>

          {alert ? (
            <Alert
              severity="error"
              onClose={() => {
                setAlert(false);
              }}
            >
              {alertContent}
            </Alert>
          ) : (
            <></>
          )}
          <Box mt={5}>
            <Copyright />
          </Box>
        </Container>
      </form>
    </React.Fragment>
  );
}
