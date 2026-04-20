import logo_dark from './../images/logo-dark.png';
import DynamicElementHandler from './DynamicElementHandler';
import Spacer from './Spacer';
import Header from './TeacherLanding/Header';
import {useForm} from './useForm';

import {CREATE_BOOK_SUBJECT_URL} from '../config/apiBase';
import {logger} from '../utils/logger';

import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import {green, purple} from '@mui/material/colors';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import {withStyles, useTheme} from '@mui/material/styles';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import React, {useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';


import './TeacherLanding/TeacherHome.css';
// Styles migrated from makeStyles to sx/inline

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
export default function CreateBook() {
  const navigate = useNavigate();

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
  const [courseBatchBooks, setCourseBatchBookList] = React.useState({
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
  const updateClient = (data) => {
    setCourseBatchBookList(data);
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
  }, []);

  const clearAccessToken = (event) => {
    event.preventDefault();
    localStorage.setItem('hevolve_access_token', '');
    navigate('/signin');
  };

  const updateAPIs = (data) => {
    // Your function
    logger.log('Entered updateAPIs ()');
    setAPIList(data);
  };

  const [APIs, setAPIList] = React.useState({name: '', is_active: true});

  const postData = (event) => {
    event.preventDefault();
    logger.log('Entered postData()');
    for (let i = 0; i < courseBatchBooks.data.length; i++) {
      if (courseBatchBooks.data[i].file_id == 0) {
        alert('Select a File for book ' + courseBatchBooks.data[i].book_name);
        return null;
      }
    }
    const url = CREATE_BOOK_SUBJECT_URL;
    const bookObj = {
      courseBatchBooks_offered: courseBatchBooks.data,
      user_id: 1,
    };

    fetch(url, {
      method: 'POST', // *GET, POST, PUT, DELETE, etc.
      // mode: 'no-cors', // no-cors, *cors, same-origin
      cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
      credentials: 'same-origin', // include, *same-origin, omit
      headers: {
        'Content-Type': 'application/json',
        // Accept: '*/*',
        accept: 'application/json',
        // 'Cache-Control': 'no-cache',
        // Connection: 'keep-alive',
        // 'Content-Type': 'application/x-www-form-urlencoded',
      },
      redirect: 'follow', // manual, *follow, error
      referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
      body: JSON.stringify(bookObj), // body data type must match "Content-Type" header
    }).then((response) => {
      if (response.status !== 200) {
        logger.log(
          'Looks like there was a problem. Status Code: ' + response.status
        );
        return;
      }
      // Examine the text in the response
      response.json().then((data) => {
        logger.log('Completed setting state!!');
        navigate('/createCourse', {
          state: {
            // location state
            client_id: data.client_id,
          },
        });
        // toggleModal();
      });
    });
  };
  return (
    <React.Fragment>
      <Header isBlack={true} />
      <form onSubmit={postData}>
        <Container component="main" maxWidth="md">
          <div className={'makeStyles-paper-10'} style={{marginTop: '50px'}}>
            <div style={{paddingBottom: '20px', display: 'flex'}}>
              {/* <div> */}

              {/* <Typography component="h1" variant="h5">
                Review Assessment
            </Typography> */}
              <Typography
                component="h2"
                variant="h3"
                align={'center'}
                style={{margin: 'auto'}}
              >
                Create Book
              </Typography>
              {/* <Avatar className={classes.avatar}>
          <LockOutlinedIcon />
        </Avatar> */}
            </div>

            <Grid item xs={12}>
              <DynamicElementHandler
                updateClient={updateClient}
                updateAPIs={updateAPIs}
                style={{paddingBotton: '0px'}}
              />
            </Grid>
          </div>
          <Spacer h={40} />
          <ColorButton
            variant="contained"
            color="primary"
            type="submit"
            style={{marginLeft: '15%'}}
          >
            Submit
          </ColorButton>
          <Box mt={5}>
            <Copyright />
          </Box>
        </Container>
      </form>
    </React.Fragment>
  );
}
export {Copyright};
