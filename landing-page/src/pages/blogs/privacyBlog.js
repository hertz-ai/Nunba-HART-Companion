// import Header from './Header';
import post2 from './blog-post.2.md';
import post3 from './blog-post.3.md';
import FeaturedPost from './FeaturedPost';
import Main from './Main';
import MainFeaturedPost from './MainFeaturedPost';
import post1 from './privc.md';
import Sidebar from './Sidebar';

// import Footer from '../Layouts/footer';
import {logger} from '../../utils/logger';
import FooterLight from '../Layouts/footer-light';
import HeaderNano from '../Layouts/header';

import {
  faLinkedin,
  faTwitter,
  faYoutube,
} from '@fortawesome/free-brands-svg-icons';
import FacebookIcon from '@mui/icons-material/Facebook';
import GitHubIcon from '@mui/icons-material/GitHub';
import TwitterIcon from '@mui/icons-material/Twitter';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import React from 'react';

const sxStyles = {
  mainGrid: {
    marginTop: '160px',
  },
};

const sections = [
  {title: 'Technology', url: '#'},
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
  title: 'Title of a longer featured blog post ',
  description:
    "Multiple lines of text that form the lede, informing new readers quickly and efficiently about what's most interesting in this post's contents.",
  image: 'https://source.unsplash.com/random',
  imgText: 'main image description',
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
const posts = [post1, post2, post3];
// const posts = [sample_post, post1, post2, post3];

const sidebar = {
  title: 'About',
  description:
    "A team of passionate people who believe in improving everyone's life using AI. We build products to solve real world problems.",
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

export default function PrivacyBlog() {
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
          {/* <MainFeaturedPost post={mainFeaturedPost} /> */}
          {/* <Grid container spacing={4}>
            {featuredPosts.map((post) => (
              <FeaturedPost key={post.title} post={post} />
            ))}
          </Grid> */}
          <Grid container spacing={5} sx={sxStyles.mainGrid}>
            <Main
              title="PRIVACY POLICY - HEVOLVE"
              posts={posts}
              discoverMore="none"
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
      <FooterLight />
    </React.Fragment>
  );
}
