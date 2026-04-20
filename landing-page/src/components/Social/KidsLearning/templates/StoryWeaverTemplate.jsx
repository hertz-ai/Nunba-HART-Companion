/**
 * StoryWeaverTemplate - Voice-Activated Interactive Story Game
 *
 * Presents branching story scenes with choices. The child can either
 * tap a choice button or say the choice aloud via speech recognition.
 * Builds reading, decision-making, and creativity skills.
 *
 * Config shape:
 *   {
 *     content: {
 *       scenes: [{
 *         scene: string,
 *         emoji: string,
 *         choices: string[],
 *         nextScenes: number[],
 *       }]
 *     }
 *   }
 *
 * Props:
 *   config     - see above
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import useSpeechRecognition from '../../../../hooks/useSpeechRecognition';
import {kidsColors} from '../kidsTheme';
import InlineCelebration from '../shared/InlineCelebration';
import {GameSounds} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';

import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import {Box, Typography, Button, Card, Fade, Grow, IconButton, Chip} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';


const SCENE_TRANSITION_DELAY = 600;
const CHOICE_COLORS = ['#6C63FF', '#FF6B6B', '#4ECDC4'];

function findBestChoice(transcript, choices) {
  if (!transcript || !choices) return -1;
  const lower = transcript.toLowerCase().trim();

  // Exact or substring match
  for (let i = 0; i < choices.length; i++) {
    const choiceLower = choices[i].toLowerCase();
    if (lower.includes(choiceLower) || choiceLower.includes(lower)) return i;
  }

  // Keyword match (check first significant word)
  const words = lower.split(/\s+/);
  for (let i = 0; i < choices.length; i++) {
    const choiceWords = choices[i].toLowerCase().split(/\s+/);
    for (const cw of choiceWords) {
      if (cw.length > 3 && words.includes(cw)) return i;
    }
  }

  // Number match ("one", "two", "three", "1", "2", "3")
  const numMap = {'one': 0, '1': 0, 'first': 0, 'two': 1, '2': 1, 'second': 1, 'three': 2, '3': 2, 'third': 2};
  for (const w of words) {
    if (numMap[w] !== undefined && numMap[w] < choices.length) return numMap[w];
  }

  return -1;
}

export default function StoryWeaverTemplate({config, onAnswer, onComplete}) {
  const scenes = config?.content?.scenes ?? [];
  const total = scenes.length;

  const [sceneIndex, setSceneIndex] = useState(0);
  const [visitedScenes, setVisitedScenes] = useState([0]);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [transitioning, setTransitioning] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);

  const {celebType, celebVisible, triggerCorrect, triggerComplete, handleCelebDone} =
    useCelebration();

  const startTimeRef = useRef(Date.now());

  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    language: 'en',
    onResult: (text) => {
      const scene = scenes[sceneIndex];
      if (!scene || transitioning) return;
      const idx = findBestChoice(text, scene.choices);
      if (idx >= 0) handleChoice(idx);
    },
  });

  const currentScene = scenes[sceneIndex];
  const isLastScene = !currentScene?.choices?.length ||
    (currentScene.nextScenes && currentScene.nextScenes.every((ns) => ns === sceneIndex));

  // Speak scene text
  useEffect(() => {
    if (currentScene) {
      try { GameSounds.speakText(currentScene.scene); } catch (_) {}
    }
    startTimeRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIndex]);

  const handleChoice = useCallback((choiceIdx) => {
    if (transitioning || !currentScene) return;
    const responseTime = Date.now() - startTimeRef.current;

    setSelectedChoice(choiceIdx);
    setTransitioning(true);
    stopListening();

    // Every choice is "correct" in a story game
    setScore((s) => s + 1);
    try { GameSounds.correct(); } catch (_) {}
    triggerCorrect();

    const concept = `story:scene-${sceneIndex}-choice-${choiceIdx}`;
    setResults((r) => [...r, {concept, correct: true, responseTime}]);
    if (onAnswer) onAnswer(true, concept, responseTime);

    const nextScene = currentScene.nextScenes?.[choiceIdx] ?? sceneIndex + 1;

    setTimeout(() => {
      if (nextScene >= scenes.length || (isLastScene && nextScene === sceneIndex)) {
        // Story complete
        triggerComplete();
        if (onComplete) {
          onComplete({
            score: score + 1,
            correct: score + 1,
            total: visitedScenes.length + 1,
            results: [...results, {concept, correct: true, responseTime}],
            bestStreak: score + 1,
          });
        }
      } else {
        setSceneIndex(nextScene);
        setVisitedScenes((v) => [...v, nextScene]);
        setSelectedChoice(null);
        setTransitioning(false);
        resetTranscript();
      }
    }, SCENE_TRANSITION_DELAY);
  }, [transitioning, currentScene, sceneIndex, scenes, score, visitedScenes, results, isLastScene,
      stopListening, resetTranscript, onAnswer, onComplete, triggerCorrect, triggerComplete]);

  const handleMicToggle = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening({language: 'en'});
    }
  }, [isListening, startListening, stopListening, resetTranscript]);

  if (!currentScene) return null;

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2}}>
      <InlineCelebration type={celebType} gameTemplate="storyweaver" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />

      {/* Scene progress */}
      <Box sx={{display: 'flex', gap: 0.5, mb: 1}}>
        {visitedScenes.map((_, i) => (
          <Box key={i} sx={{
            width: 8, height: 8, borderRadius: '50%',
            bgcolor: i === visitedScenes.length - 1 ? kidsColors.primary : kidsColors.textMuted,
          }} />
        ))}
      </Box>

      {/* Scene emoji */}
      <Fade in timeout={400} key={sceneIndex}>
        <Typography sx={{fontSize: 72}}>{currentScene.emoji}</Typography>
      </Fade>

      {/* Scene text */}
      <Fade in timeout={600} key={`text-${sceneIndex}`}>
        <Card sx={{
          px: 3, py: 2, borderRadius: '16px', maxWidth: 340,
          bgcolor: kidsColors.card,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        }}>
          <Typography variant="body1" sx={{
            color: kidsColors.textPrimary, fontSize: '1.05rem',
            lineHeight: 1.6, textAlign: 'center',
          }}>
            {currentScene.scene}
          </Typography>
        </Card>
      </Fade>

      {/* Choices */}
      {currentScene.choices && currentScene.choices.length > 0 && (
        <Box sx={{display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%', maxWidth: 340, mt: 1}}>
          {currentScene.choices.map((choice, idx) => (
            <Grow in timeout={400 + idx * 150} key={idx}>
              <Button
                variant={selectedChoice === idx ? 'contained' : 'outlined'}
                onClick={() => handleChoice(idx)}
                disabled={transitioning}
                sx={{
                  borderRadius: '12px',
                  py: 1.5,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  bgcolor: selectedChoice === idx ? CHOICE_COLORS[idx % 3] : 'transparent',
                  borderColor: CHOICE_COLORS[idx % 3],
                  color: selectedChoice === idx ? '#fff' : CHOICE_COLORS[idx % 3],
                  '&:hover': {
                    bgcolor: selectedChoice === idx ? CHOICE_COLORS[idx % 3] : `${CHOICE_COLORS[idx % 3]}15`,
                  },
                }}
              >
                {choice}
              </Button>
            </Grow>
          ))}
        </Box>
      )}

      {/* Voice input */}
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mt: 1}}>
        <IconButton
          onClick={handleMicToggle}
          disabled={transitioning}
          sx={{
            bgcolor: isListening ? '#FF6B35' : kidsColors.blue,
            color: '#fff',
            '&:hover': {bgcolor: isListening ? '#E55A25' : '#0770C4'},
          }}
        >
          {isListening ? <MicIcon /> : <MicOffIcon />}
        </IconButton>
        <Typography variant="caption" sx={{color: kidsColors.textMuted}}>
          {isListening ? 'Listening... say a choice!' : 'Or tap the mic to choose by voice'}
        </Typography>
      </Box>

      {transcript && (
        <Chip label={`"${transcript}"`} size="small" sx={{bgcolor: kidsColors.surfaceLight}} />
      )}
    </Box>
  );
}
