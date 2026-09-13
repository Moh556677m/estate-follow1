import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import ArticlesListPage from './InsightsArticles';

const InsightsVideos = () => {
  const { t } = useLanguage();
  return (
    <ArticlesListPage
      fixedType="video"
      pageTitle={t('insights_videos')}
      pageDescription={t('brand_desc')}
      seoTitle={`${t('insights_videos')} — ${t('brand')} Insights`}
    />
  );
};

export default InsightsVideos;
