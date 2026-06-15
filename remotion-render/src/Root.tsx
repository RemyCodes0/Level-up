import { Composition } from "remotion";
import { DynamicLesson } from "./compositions/DynamicLessons";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DynamicLesson"
      component={DynamicLesson}
      durationInFrames={9000}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        title: "Introduction",
        description: "A lesson description",
        keyPoints: ["Point 1", "Point 2", "Point 3", "Point 4"],
        lessonNumber: 1,
      }}
    />
  );
};
