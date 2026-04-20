import React, {useState} from 'react';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
// get our fontawesome imports
// import {faUserPlus, faSearch} from '@fortawesome/fontawesome-free';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import DynamicElementHandler from './DynamicElementHandler';
import {logger} from '../utils/logger';
import Chip from '@mui/material/Chip';
import Select from '@mui/material/Select';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Input from '@mui/material/Input';
import Snackbar from '@mui/material/Snackbar';
import {SnackbarContent} from '@mui/material';
import Spacer from './Spacer';
import logo_dark from './../images/logo-dark.png';
import FormHelperText from '@mui/material/FormHelperText';
import {QuestionAnswer} from '@mui/icons-material';
import Hidden from '@mui/material/Hidden';
import Controls from './controls/Controls';
import {useForm} from './useForm';
import Header from './TeacherLanding/Header';
import './TeacherLanding/TeacherHome.css';
import {QUES_ANS3_URL, QUES_ANS_URL} from '../config/apiBase';
import {mailerApi} from '../services/socialApi';
import {faUserPlus, faPaperPlane} from '@fortawesome/free-solid-svg-icons';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {Autocomplete} from '@mui/lab';
import Alert from '@mui/lab/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import {green, purple} from '@mui/material/colors';
import Container from '@mui/material/Container';
import FormControl from '@mui/material/FormControl';
import Form from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import {withStyles, useTheme} from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import {AdapterDateFns} from '@mui/x-date-pickers/AdapterDateFns';
import {DatePicker} from '@mui/x-date-pickers/DatePicker';
import {LocalizationProvider} from '@mui/x-date-pickers/LocalizationProvider';
import {useNavigate} from 'react-router-dom';

const sxStyles = {
  root: {
    flexGrow: 1,
    '& .MuiTextField-root': {
      margin: '8px',
      width: '100%',
    },
  },
  paper: {
    marginTop: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  avatar: {
    margin: '8px',
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

function BasicDatePicker() {
  const [selectedDate, handleDateChange] = useState(new Date());

  return (
    // <KeyboardDatePicker
    //   disableToolbar
    //   variant="inline"
    //   inputVariant="outlined"
    //   margin="normal"
    //   format="MMM/dd/yyyy"
    //   id="Schedule Date"
    //   label="Schedule Date"
    //   name="schedule_date"
    //   value={values.schedule_date}
    //   onChange={handleInputChange}
    // />
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <DatePicker
        label="Basic example"
        value={selectedDate}
        onChange={handleDateChange}
      />
    </LocalizationProvider>
  );
}

const initialFValues = {
  schedule_date: new Date(),
};
// ####
export default function CreateAssessment() {
  const navigate = useNavigate();
  const [schedule_date, setSchedule_date] = React.useState(
    new Date('2014-08-18T21:11:54')
  );
  const [ale, setAle] = useState(false);
  const [alertContent, setAlertContent] = useState('');
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
  const validate = (fieldValues = values) => {
    const temp = {...errors};
    if ('schedule_date' in fieldValues)
      temp.schedule_date = fieldValues.schedule_date
        ? ''
        : 'This field is required.';
    setErrors({
      ...temp,
    });

    if (fieldValues == values) return Object.values(temp).every((x) => x == '');
  };
  const {values, setValues, errors, setErrors, handleInputChange, resetForm} =
    useForm(initialFValues, true, validate);
  const [value, setValue] = React.useState('comprehension1');
  const [errorMessage, setErrorMessage] = React.useState('');

  const [assessments_list, setassessments_list] = React.useState([
    {
      assessment_id: 1,
      assessment_type: 'GG',
      course_name: '222',
      is_active: true,
      name: 'assessement_1',
      number_of_questions: 20,
    },
  ]);
  const [quesAndAnsList, setQuesAndAnsList] = React.useState([]);
  // const [quesAndAnsList, setQuesAndAnsList] = React.useState([
  //   {
  //     id: 1,
  //     question: 'sample question?',
  //     question_type: 'NA',
  //     answer: 'sample answer',
  //     assessment_id: '2',
  //     is_active: true,
  //   },
  // ]);
  const [book_name, setbook_name] = React.useState('');
  const [page_start, setpage_start] = React.useState('');
  const [page_end, setpage_end] = React.useState('');
  const [assessment_name, setAssessment_name] = React.useState('');
  const [course_name, setcourse_name] = React.useState('');
  const [number_of_questions, setnumber_of_questions] = React.useState(0);
  const [assessment_type, setassessment_type] = React.useState('');
  const [is_active, setis_active] = React.useState(true);
  const [book, setBook] = React.useState([]);
  const [course, setCourse] = useState([]);
  // const MenuItem = ({text, selected}) => {
  //   return (
  //     <div>
  //       <div className="menu-item">{text}</div>
  //     </div>
  //   );
  // };
  const fetchCourse = async () => {
    mailerApi
      .getCourses()
      .then((data) => {
        setCourse(data);
      })
      .catch((error) => {
        logger.log(error);
        setAlertContent('unable to get Course,please try again');
        setAle(true);
      });
  };
  const fetchBook = (newValue) => {
    logger.log(newValue);
    mailerApi
      .getBooksByCourse(newValue)
      .then((data) => {
        setBook(data);
        logger.log(data);
      })
      .catch((error) => {
        logger.log(error);
        setAlertContent('unable to get Book,please try again');
        setAle(true);
      });
  };
  React.useEffect(() => {
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

    // TODO - endpoints in config file
    mailerApi
      .allAssessments({limit: 100})
      .then((data) => setassessments_list(data));
  }, []);

  const handleCourseChange = (newValue) => {
    logger.log('Entered handlecoursechange()');
    setcourse_name(newValue);
    fetchBook(newValue);
  };
  const [APIs, setAPIList] = React.useState({name: '', is_active: true});
  const [apiNames, setAPINames] = React.useState([]);
  const [apiNamesDict, setAPINamesDict] = React.useState([
    {name: '', is_active: true},
  ]);
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

  const NoOptionsMessage1 = (props) => {
    return (
      <div {...props}>
        <Button
          variant="contained"
          style={{width: 'auto'}}
          onMouseDown={() => {
            navigate('/createCourse');
          }}
        >
          Create a course
        </Button>
      </div>
    );
  };

  const updateForm = (event) => {
    event.preventDefault();
    logger.log('updateForm() !');
    const formData = new FormData(event.target);
    logger.log(formData);
    const temp_dict = {};
    const assessment_dict = {};
    logger.log(formData.entries());
    for (const [key, value] of formData.entries()) {
      logger.log(key, value);
      if (key == 'book_name') {
        temp_dict['book_name'] = value;
      }
      if (key == 'page_start-basic') {
        temp_dict['page_start'] = value;
      }
      if (key == 'page_end-basic') {
        temp_dict['page_end'] = value;
      }
      if (key == 'assessment_name-basic') {
        assessment_dict['name'] = value;
      }
      if (key == 'course_name') {
        assessment_dict['course_name'] = value;
      }
      if (key == 'number_of_questions-basic') {
        assessment_dict['number_of_questions'] = value;
      }
      if (key == 'assessment_type_select') {
        assessment_dict['assessment_type'] = value;
      }
      assessment_dict['is_active'] = true;
      temp_dict['assessment'] = assessment_dict;
      logger.log('assessment info to be sent ..');
    }
    logger.log(JSON.stringify(temp_dict));
    alert('Click ok to create QA and please wait !');
    updateDatabase(temp_dict);
  };

  const updateDatabase = (temp_dict) => {
    logger.log('updateDatabase()');
    const dicti = JSON.stringify(temp_dict);
    const create_QA_url = QUES_ANS3_URL;
    fetch(create_QA_url, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
        Accept: '*/*',
        accept: 'application/json',
      },
      body: dicti,
      timeout: 100000, // in milliseconds
    })
      .then((result) => {
        if (result.status == 400) {
          logger.log(
            'Looks like there was a problem. Status Code:' + result.status
          );
          logger.log('Assessment already in database');
          setAlertContent('Assessment already exists !!');
          setAle(true);
        } else if (result.status == 200) {
          logger.log('assessment creation is successful..');
          alert('Assessment Created');
          navigate('/reviewQA');
        } else {
          logger.log(
            'Looks like there was a problem. Status Code: ' + result.status
          );
          logger.log(result.data);
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          logger.log('Request timed out after 100 seconds.');
          const create_QA_url = QUES_ANS_URL;
          fetch(create_QA_url, {
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
              Accept: '*/*',
              accept: 'application/json',
            },
            body: dicti,
            timeout: 100000, // in milliseconds
          })
            .then((result) => {
              if (result.status == 400) {
                logger.log(
                  'Looks like there was a problem. Status Code:' + result.status
                );
                logger.log('Assessment already in database');
                setAlertContent('Assessment already exists !!');
                setAle(true);
              } else if (result.status == 200) {
                logger.log('assessment creation is successful..');
                alert('Assessment Created');
                navigate('/reviewQA');
              } else {
                logger.log(
                  'Looks like there was a problem. Status Code: ' +
                    result.status
                );
                logger.log(result.data);
              }
            })
            .catch((error) => {
              setErrorMessage(error.message);
              console.error('There was an error!', error);
              logger.log(error.message);
            });
        } else {
          setErrorMessage(error.message);
          console.error('There was an error!', error);
          logger.log(error.message);
        }
      });
  };

  return (
    <React.Fragment>
      <Header isBlack={true} />

      <Container component="main" maxWidth="md">
        <Box sx={sxStyles.paper}>
          <div style={{paddingBottom: '6px', display: 'flex'}}>
            {/* <div> */}

            {/* <Typography component="h1" variant="h5">
                Review Assessment
            </Typography> */}
            <Typography component="h2" variant="h3" align={'center'}>
              Create Assessment
            </Typography>
            {/* <Avatar className={classes.avatar}>
          <LockOutlinedIcon />
        </Avatar> */}
            <FontAwesomeIcon
              icon={faPaperPlane}
              color="#0078ff"
              size="3x"
              style={sxStyles.avatar}
            ></FontAwesomeIcon>
          </div>

          <form onSubmit={updateForm} noValidate autoComplete="off">
            <Autocomplete
              id="course_name"
              disableClearable
              className="col-12"
              noOptionsText={<NoOptionsMessage1 />}
              required
              options={course.map((option) => option.name)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  name="course_name"
                  id="course_name"
                  label="Select a Course"
                />
              )}
              onChange={(event, newValue) => handleCourseChange(newValue)}
            />
            <Autocomplete
              id="book_name"
              disableClearable
              className="col-12"
              noOptionsText={<NoOptionsMessage />}
              required
              options={book.map((option) => option)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  name="book_name"
                  id="book_name"
                  label="Select a Book"
                />
              )}
              onChange={(event) => setbook_name(event.target.value)}
            />
            <TextField
              id="page_start-basic"
              name="page_start-basic"
              type="number"
              label="page start"
              value={page_start}
              onChange={(event) => setpage_start(event.target.value)}
            />
            <TextField
              id="page_end-basic"
              name="page_end-basic"
              type="number"
              label="page end"
              value={page_end}
              onChange={(event) => setpage_end(event.target.value)}
            />
            <TextField
              id="assessment_name-basic"
              name="assessment_name-basic"
              label="assessment name"
              value={assessment_name}
              onChange={(event) => setAssessment_name(event.target.value)}
            />
            <TextField
              id="number_of_questions-basic"
              name="number_of_questions-basic"
              type="number"
              label="number of questions"
              value={number_of_questions}
              onChange={(event) => setnumber_of_questions(event.target.value)}
            />

            <InputLabel id="demo-simple-select-label">
              assessment type
            </InputLabel>
            <Select
              labelId="demo-simple-select-label"
              id="assessment_type_select"
              name="assessment_type_select"
              value={assessment_type}
              onChange={(event) => setassessment_type(event.target.value)}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              <MenuItem value="MCQ">MCQ</MenuItem>
              <MenuItem value="MOCK_INTERVIE">MOCK_INTERVIE</MenuItem>
              <MenuItem value="LONGFORM_QA">LONGFORM_QA</MenuItem>
              <MenuItem value="CONVERSATION_FOR_IMPROVING_ENGLISH">
                CONVERSATION_FOR_IMPROVING_ENGLISH
              </MenuItem>
              <MenuItem value="REVISION">REVISION</MenuItem>
            </Select>
            <br />
            <ColorButton
              variant="contained"
              color="primary"
              type="submit"
              style={{marginLeft: '15%'}}
            >
              Submit
            </ColorButton>
          </form>

          <form
            id="qaEditableForm"
            noValidate
            onSubmit={updateForm}
            style={{display: 'none'}}
          >
            {/* <div style={{paddingBottom: '20px', display: 'flex'}}> */}
            <Box sx={sxStyles.root}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography component="h1" variant="h6" align={'center'}>
                    Question and Answers
                  </Typography>
                </Grid>
                {quesAndAnsList.map((item) => (
                  <>
                    <Grid item xs={12}>
                      {/* <Typography component="h3" variant="h6" name="qa_id">
                        ID : {item.id}
                      </Typography> */}
                      {/* <Hidden xsDown smDown mdDown lgDown xlDown> */}

                      <TextField
                        label="id"
                        name="qa_id"
                        defaultValue={item.id}
                        style={{display: 'none'}}
                      ></TextField>
                      <TextField
                        label="id"
                        name="assess_id"
                        defaultValue={item.assessment_id}
                        style={{display: 'none'}}
                      ></TextField>
                      <TextField
                        label="id"
                        name="ques_type"
                        defaultValue={item.question_type}
                        style={{display: 'none'}}
                      ></TextField>
                      {/* </Hidden> */}
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        variant="outlined"
                        required
                        fullWidth
                        label="question"
                        name="question"
                        type="text"
                        color="primary"
                        defaultValue={item.question}
                      ></TextField>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        variant="outlined"
                        fullWidth
                        multiline
                        rows={4}
                        label="answer"
                        name="answer"
                        type="text"
                        defaultValue={item.answer}
                      ></TextField>
                    </Grid>
                    <br></br>
                    <br></br>
                  </>
                ))}
              </Grid>
              <ColorButton
                variant="contained"
                color="primary"
                type="submit"
                style={{marginLeft: '15%'}}
              >
                Submit
              </ColorButton>
            </Box>
          </form>
          <br></br>
          {ale ? <Alert severity="error">{alertContent}</Alert> : <></>}
        </Box>
        <Box mt={5}>
          <Copyright />
        </Box>
      </Container>
    </React.Fragment>
  );
}
