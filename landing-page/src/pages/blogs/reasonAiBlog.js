// import FacebookIcon from '@mui/icons-material/Facebook';
// import Header from './Header';
import post2 from './blog-post.2.md';
import FeaturedPost from './FeaturedPost';
import Main from './Main';
import MainFeaturedPost from './MainFeaturedPost';
import post1 from './Resoning.md';
import Sidebar from './Sidebar';
import post3 from './wpp.md';

import Spacer from '../../components/Spacer';
import FooterLight from '../../pages/Layouts/footer-light';

// color button styles - starts
// color button styles - ends

import {logger} from '../../utils/logger';
import Footer from '../Layouts/footer';
import HeaderNano from '../Layouts/header';

import {
  faLinkedin,
  faTwitter,
  faYoutube,
} from '@fortawesome/free-brands-svg-icons';
import GitHubIcon from '@mui/icons-material/GitHub';
import TwitterIcon from '@mui/icons-material/Twitter';
import Button from '@mui/material/Button';
import {purple} from '@mui/material/colors';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import {withStyles} from '@mui/material/styles';
import React from 'react';

const sxStyles = {
  mainGrid: {
    marginTop: '24px',
  },
};

const sections = [
  {title: 'Reasoning With Time', url: '#'},
  {title: 'Design', url: '#'},
  {title: 'Culture', url: '#'},
  {title: 'Business', url: '#'},
  {title: 'Politics', url: '#'},
  {title: 'Opinion', url: '#'},
  {title: 'Science', url: '#'},
  {title: 'Health', url: '#'},
  {title: 'Style', url: '#'},
  {title: 'Travel', url: '#'},
];

const mainFeaturedPost = {
  title: 'Reasoning With AI',
  description:
    'Reasoning is the most important aspect of AI which makes it looks like Magic and the magic is here at HertzAI. We are building models to reason and answer from knowledge graphs which gets updated and continually learnt.',
  image: 'https://etime.hertzai.com/web/image/1154/background_s2-bg.jpg',
  imgText: 'Reasoning with AI description',
  linkText: 'Continue reading…',
};

const featuredPosts = [
  {
    title: 'Featured post',
    date: 'Nov 12',
    description:
      'This is a wider card with supporting text below as a natural lead-in to additional content.',
    image: 'https://source.unsplash.com/random',
    imageText: 'Image Text',
  },
  {
    title: 'Post title',
    date: 'Nov 11',
    description:
      'This is a wider card with supporting text below as a natural lead-in to additional content.',
    image: 'https://source.unsplash.com/random',
    imageText: 'Image Text',
  },
];

// const sample_post = "# React & Markdown App";
const sample_post =
  'http://localhost:3000/static/media/blog-post.3.fec40a74.md';
// const posts = [post1, post2, post3];
const posts = [sample_post, post1, post2, post3];

const sidebar = {
  title: 'About',
  description:
    'Hevolve redefines the learning experience by giving a multimodal interaction with conversational AI bot as teacher sourcing raw knowledge directly from books, internet, videos. Our mission is to make teaching transcend current human boundaries creating a fully autonomous AI system with superhuman teaching capabilities which understands every individual creating tailored dynamic curriculum, with teaching, assessment and revision flows in unbiased fashion.',
  archives: [
    {title: 'September 2020', url: '#'},
    {title: 'August 2020', url: '#'},
    {title: 'July 2020', url: '#'},
    {title: 'June 2020', url: '#'},
    {title: 'May 2020', url: '#'},
    {title: 'April 2020', url: '#'},
  ],
  social: [
    {
      name: 'Youtube',
      icon: faYoutube,
      link: 'https://www.youtube.com/channel/UClzFvo8SECdyd0dVQhJ2Cbg',
    },
    {
      name: 'Linkedin',
      icon: faLinkedin,
      link: 'https://www.linkedin.com/company/hertz-ai/',
    },
    {
      name: 'Twitter',
      icon: faTwitter,
      link: 'https://twitter.com/AiHertz?s=20',
    },
  ],
};

const ColorButton = withStyles((theme) => ({
  root: {
    color: theme.palette.getContrastText(purple[500]),
    // color: "linear-gradient(to right, #00e89d, #0078ff)",
    background: 'linear-gradient(to right, #00e89d, #0078ff)',
    // backgroundColor: purple[500],
    '&:hover': {
      backgroundColor: purple[700],
    },
  },
}))(Button);

export default function ReasonAiBlog() {
  const [posts, setPosts] = React.useState([]);

  React.useEffect(() => {
    logger.log('Blog is fully loaded');
    // getAllAssessmentNames();
    fetch(post1)
      .then((res) => res.text())
      .then((postContent) => setPosts([postContent]))
      .catch((err) => console.error(err));
  }, []);

  return (
    <React.Fragment>
      <HeaderNano />
      <Container maxWidth="lg">
        {/* <Header title="Blog" sections={sections} /> */}
        <main>
          <MainFeaturedPost post={mainFeaturedPost} />
          {/* <Grid container spacing={4}>
            {featuredPosts.map((post) => (
              <FeaturedPost key={post.title} post={post} />
            ))}
          </Grid> */}
          <Grid container spacing={5} sx={sxStyles.mainGrid}>
            <Main
              title="Reasoning With AI"
              posts={posts}
              discoverMore="block"
            />
            <Sidebar
              title={sidebar.title}
              description={sidebar.description}
              archives={sidebar.archives}
              social={sidebar.social}
            />
          </Grid>
        </main>
      </Container>
      <Spacer h={120} />
      <FooterLight />
      {/* <Footer /> */}
    </React.Fragment>
  );
}
